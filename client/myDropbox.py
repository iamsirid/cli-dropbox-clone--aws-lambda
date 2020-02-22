import requests
import json

# endpoint ไปยัง AWS Lambda
endpoint = 'https://7sfj92tyir-this-is-not-real-endpoint-na-eiei.execute-api.ap-southeast-1.amazonaws.com/latest'

print('======================================================')
print('Please input command (newuser username password password, login')
print('username password, put filename, get filename, view, or logout).')
print('If you want to quit the program just type quit.')
print('======================================================')

# user_access_token สำหรับใช้ access การดำเนินการบน S3 ตามคำสั่ง view, get, put
# is_login เก็บสถานะการ login
user_access_token = ''
is_login = False

while True:
    cmds = input().split()
    # คำสั่ง newuser สำหรับสร้าง user ใหม่
    # รูปแบบคำสั่ง newuser {username} {password} {password}
    if cmds[0] == 'newuser' and not is_login:
        if cmds[2] == cmds[3]:
            res = requests.post(endpoint + '/newuser',
                                data={'username': cmds[1], 'password': cmds[2]})
            resDict = json.loads(res.text)
            print('OK')
        else:
            print('password and confirmation password do not match')

    # คำสั่ง login สำหรับ login เข้าสู่ระบบโดยเมื่อ login สำเร็จจะได้ user_access_token มา
    # รูปแบบคำสั่ง login {username} {password}
    elif cmds[0] == 'login':
        res = requests.post(endpoint + '/login',
                            data={'username': cmds[1], 'password': cmds[2]})
        resDict = json.loads(res.text)
        if('error' in resDict):
            print(resDict['error'])
        else:
            user_access_token = resDict['data']['Attributes']['userAccessToken']
            is_login = True
            print('OK')

    # คำสั่ง put สำหรับ upload ไฟล์ โดยต้องส่ง user_access_token ไปด้วย
    # รูปแบบคำสั่ง put {file_name}
    elif cmds[0] == 'put' and is_login:
        mFile = {'fileData': open(cmds[1], 'rb')}
        res = requests.post(endpoint + '/put', files=mFile,
                            data={'userAccessToken': user_access_token})
        resDict = json.loads(res.text)
        print('OK')

    # คำสั่ง view สำหรับ list ไฟล์ทั้งหมดของ user นั้น ๆ โดยต้องส่ง user_access_token ไปด้วย
    # รูปแบบคำสั่ง view
    elif cmds[0] == 'view' and is_login:
        res = requests.post(endpoint + '/view',
                            data={'userAccessToken': user_access_token})
        resDict = json.loads(res.text)
        if len(resDict) == 0:
            print('no files')
        else:
            for data in resDict:
                print(' '.join(str(e) for e in data))

    # คำสั่ง get สำหรับ download ไฟล์ของ user นั้น ๆ ตามที่ชื่อไฟล์ที่ได้ระบุ โดยต้องส่ง user_access_token ไปด้วย
    # รูปแบบคำสั่ง get {file_name}
    elif cmds[0] == 'get' and is_login:
        res = requests.post(
            endpoint + '/get', data={'fileName': cmds[1], 'userAccessToken': user_access_token})
        resDict = json.loads(res.text)
        if('error' in resDict):
            print(resDict['error'])
        else:
            f = open(resDict['name'], 'wb')
            f.write(bytearray(resDict['file']['data']))
            f.close()
            print('OK')

    # คำสั่ง logout เป็นการแจ้งการออกจากระบบ โดยต้องส่ง user_access_token ไปด้วย
    # รูปแบบคำสั่ง logout
    elif cmds[0] == 'logout' and is_login:
        res = requests.post(
            endpoint + '/logout', data={'userAccessToken': user_access_token})
        resDict = json.loads(res.text)
        user_access_token = ''
        is_login = False
        print('OK')

    # คำสั่ง quit เป็นการจบการทำงานของฝั่ง client
    # รูปแบบคำสั่ง quit
    elif cmds[0] == 'quit':
        user_access_token = ''
        is_login = False
        break

    else:
        print('wrong command and/or unauthorize command')
