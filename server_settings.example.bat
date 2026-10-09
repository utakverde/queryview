@echo off
rem Copy this file to server_settings.bat and update values for the target server.
rem Keep server_settings.bat private because it can contain the database password.

rem Use 127.0.0.1 for local-only access or 0.0.0.0 for LAN access.
set "REPORT_HOST=127.0.0.1"
set "PORT=3001"

rem Leave NODE_EXE empty to use node.exe from PATH when the bundled path is absent.
rem set "NODE_EXE=C:\Program Files\nodejs\node.exe"

rem MySQL client executable and remote database connection.
rem Change these four values to the schema names on your MySQL server.
set "MYSQL_DATABASE_1=dbsamelco"
set "MYSQL_DATABASE_2=dbsamelco_catbalogan"
set "MYSQL_DATABASE_3=dbsamelco_basey"
set "MYSQL_DATABASE_4=dbsamelco_villareal"
set "MYSQL_EXE=mysql.exe"
set "MYSQL_HOST=192.168.1.99"
set "MYSQL_PORT=3306"
set "MYSQL_USER=root"
set "MYSQL_PASSWORD=YOUR_DATABASE_PASSWORD"
