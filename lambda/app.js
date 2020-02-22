'use strict';
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Busboy = require('busboy');
const cryptoRandomString = require('crypto-random-string');
const bcrypt = require('bcryptjs');
/* 
why 'bcryptjs' and not 'bcrypt'? 
local dev env is macOS and deploy on lambda (Linux) 
and 'bcrypt' has macOS and linux compatibility issue (how ironic)
npm install won't work on lambda so i have to use claudia to generate node_module locally, 
send it to lambda directly so it's macOS version of 'bcrypt' on linux
which is not the case for 'bcryptjs'   
*/

const connectBusboy = require('connect-busboy');
const busboyBodyParser = require('busboy-body-parser');

const AWS = require('aws-sdk');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(connectBusboy());
app.use(busboyBodyParser());

const tableName = 'your-super-awesome-table-name';
const bucketName = 'your-super-dedicated-unique-bucket-name';

app.post('/newuser', async (req, res) => {
  const { username, password } = req.body;
  const docClient = new AWS.DynamoDB.DocumentClient(); // เรียก document client ของ DynamoDB
  const hash = await bcrypt.hash(password, 1); // hash password ของ user
  const params = {
    TableName: tableName,
    Item: {
      username,
      hash
    }
  };

  // put item ที่มี attr คือ username,hash เข้า table
  docClient.put(params, (err, data) => {
    if (err) return res.status(500).send({ error: err });
    res.send({ msg: 'success' });
  });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const docClient = new AWS.DynamoDB.DocumentClient();

  try {
    // get item จาก DynamoDB โดยใช้ key username เพื่อเอา hash มาทำการเปรียบเทียบกับ password
    const {
      Item: { username: _username, hash }
    } = await (params =>
      new Promise((resolve, reject) => {
        docClient.get(params, (err, data) => {
          if (err) return reject(err);
          resolve(data);
        });
      }))({
      TableName: tableName,
      Key: {
        username
      },
      AttributesToGet: ['username', 'hash']
    });

    // เปรียบเทียบ username ที่ได้จาก table และเปรียบเทียบ password กับ hash
    if (_username !== username || !(await bcrypt.compare(password, hash))) {
      throw new Error('unauthorize');
    }

    // gererate userAccessToken โดยเป็น random string
    const userAccessToken = cryptoRandomString({
      length: 15,
      type: 'url-safe'
    });

    const params = {
      TableName: tableName,
      Key: {
        username
      },
      UpdateExpression: 'set userAccessToken = :t',
      ExpressionAttributeValues: {
        ':t': userAccessToken
      },
      ReturnValues: 'UPDATED_NEW'
    };

    // update item ใส่ attr userAccessToken
    docClient.update(params, (err, data) => {
      if (err) throw err;
      res.send({ data: data });
    });
  } catch (err) {
    console.log(err);
    res.status(500).send({ error: err.message });
  }
});

// utillity สำหรับเช็ค userAccessToken ว่าเป็นของ user ไหน เพื่อ get username, password
const userAccessTokenCheck = async userAccessToken => {
  const docClient = new AWS.DynamoDB.DocumentClient();

  var params = {
    ExpressionAttributeValues: {
      ':t': userAccessToken
    },
    KeyConditionExpression: 'userAccessToken = :t',
    ProjectionExpression: 'username,password',
    TableName: tableName,
    IndexName: 'userAccessToken-index'
  };

  return new Promise((resolve, reject) => {
    docClient.query(params, (err, data) => {
      if (err) reject(err);

      resolve(data.Items[0]);
    });
  });
};

app.post('/logout', async (req, res) => {
  const { userAccessToken } = req.body;

  const { username, password } = await userAccessTokenCheck(userAccessToken);

  const docClient = new AWS.DynamoDB.DocumentClient();

  const params = {
    TableName: tableName,
    Key: {
      username,
      password
    },
    UpdateExpression: 'REMOVE userAccessToken', //ลบ attr userAccessToken
    ReturnValues: 'UPDATED_NEW'
  };

  docClient.update(params, (err, data) => {
    if (err) throw err;
    res.send({ data: data });
  });
});

app.post('/get', async (req, res) => {
  const { fileName, userAccessToken } = req.body;
  const { username } = await userAccessTokenCheck(userAccessToken);
  const s3 = new AWS.S3({}); // เรียกใช้ AWS S3

  const options = {
    Bucket: bucketName,
    Key: `${username}/${fileName}` // Key อยู่ในรูป {username}/{password}
  };

  // get object ตาม Key
  s3.getObject(options, function(err, data) {
    if (err) return res.status(500).send({ error: err.message });
    res.send({ name: fileName, file: data.Body });
  });
});

app.post('/view', async (req, res) => {
  const { userAccessToken } = req.body;
  const s3 = new AWS.S3({});
  const { username } = await userAccessTokenCheck(userAccessToken);
  const options = {
    Bucket: bucketName,
    Prefix: `${username}/` // ใส่ Prefix ตาม username เพื่อให้ access ถูก object
  };

  // list object ทั้งหมดของ user
  s3.listObjects(options, function(err, data) {
    res.send(
      // ส่ง response ในรูป [{objName},{objSize},{objLastModified}]
      data['Contents'].map(obj => [
        obj.Key.substring(obj.Key.lastIndexOf('/') + 1, obj.Key.length), // {username}/{objName} --> {objName}
        obj.Size,
        obj.LastModified
      ])
    );
  });
});

app.post('/put', async (req, res) => {
  const busboy = new Busboy({ headers: req.headers }); // ใช้ busboy ในการ parse multipart/form-data

  const s3 = new AWS.S3({});

  busboy.on('finish', async () => {
    const { userAccessToken } = req.body;
    const { username } = await userAccessTokenCheck(userAccessToken);
    const file = req.files.fileData;
    const options = {
      Bucket: bucketName,
      Key: `${username}/${file.name}`, // Key อยู่ในรูป {username}/{password}
      Body: file.data
    };

    // put ไฟล์เป็น S3 object
    s3.putObject(options, function() {
      res.send({ msg: 'upload finished' });
    });
  });
  req.pipe(busboy);
});

module.exports = app;
