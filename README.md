# Command-line Dropbox Clone with Serverless AWS Lambda + DynamoDB

## /client

### python

client side
run on your local

```
python myDropbox.py
```

## /lambda

### node.js + express

deploy on AWS lambda using claudia
you have to create DynamoDB with 1 partition key 'username' and global secondary index 'userAccessToken'

```
npm i
```

claudia cli is required

to deploy

```
bash deploy.sh
```

to redeploy (updated code)

```
bash update.sh
```

after deploy you have to change this lambda function execution role to allow S3 and DynamoDB operation
