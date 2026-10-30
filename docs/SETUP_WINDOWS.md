# Windows setup - easy steps

## 1. Install Node.js

Install Node.js LTS. After installation, close and reopen VS Code.

Check in VS Code Terminal:

```bat
node -v
npm -v
```

Node 20+ is recommended because this project uses Node's built-in `.env` loading.

## 2. Install MongoDB Community Server

Install MongoDB Community Server for Windows. During setup, installing MongoDB as a Windows service is the easiest option.

If MongoDB is installed as a service, it can run in the background automatically.

Optional: install MongoDB Compass for a graphical database interface.

If `mongosh` is not recognized, that is not necessarily a server problem. `mongosh` is distributed separately from the MongoDB Server installer in many Windows setups.

## 3. Extract this project

Extract the ZIP somewhere simple, for example:

```text
D:\BCA\OnlineVotingSystem-React
```

Open that folder in VS Code:

**VS Code → File → Open Folder → OnlineVotingSystem-React**

## 4. Install backend packages

Open VS Code Terminal:

```bat
cd backend
npm install
```

Then seed the database:

```bat
npm run seed
```

You should see `Seed complete`.

## 5. Start backend

Keep this terminal open:

```bat
npm start
```

Expected message:

```text
VoteSphere backend: http://localhost:5000
```

You can test:

```text
http://localhost:5000/api/health
```

## 6. Install frontend packages

Open a second VS Code terminal:

```bat
cd frontend
npm install
```

Start React:

```bat
npm run dev
```

Vite will show a local URL, normally:

```text
http://localhost:5173
```

Open that URL in Chrome.

## 7. Login test

Admin:

```text
Username: admin
Password: admin123
```

Voter:

```text
Username: voter1
Password: voter123
```

Candidate:

```text
Username: candidate1
Password: candidate123
```

## 8. Test candidate approval flow

1. Logout.
2. Open Register.
3. Select Candidate.
4. Fill the candidate form.
5. Submit.
6. Login as admin.
7. Open Candidates.
8. Find the new candidate. It should be `pending`.
9. Click Approve.
10. Logout.
11. Candidate can now login.
12. Candidate will see the approval notification.

## 9. Test voter 18+ validation

Try registering a voter with age `17`.

The form should reject it.

Try age `18` or above.

The registration should continue if all other fields are valid.

## 10. Test duplicate email

Register one account using an email.

Try registering another account with the same email.

The backend should return an `email is already registered` message. MongoDB also has a unique email index as a second layer of protection.

## 11. Test admin search/update/delete

Admin → Voters:

- Search by name, username, email or phone.
- Edit name/phone/age.
- Block/activate.
- Delete.

Admin → Candidates:

- Search by candidate, party, election or status.
- Approve/reject.
- Edit candidate.
- Delete.

Admin → Elections:

- Create.
- Edit.
- Delete.

Admin → Notifications:

- Send to everyone.
- Send to voters.
- Send to candidates.

## 12. If MongoDB connection fails

Check that MongoDB is running.

On Windows:

**Win + R → services.msc → MongoDB → Start**

The project expects:

```text
mongodb://127.0.0.1:27017
```

If your MongoDB uses another address/port, edit `backend/.env`.

## 13. If PowerShell blocks npm

Use the VS Code terminal dropdown and choose **Command Prompt** instead of PowerShell.

Then run:

```bat
cd backend
npm install
npm start
```

and in another Command Prompt terminal:

```bat
cd frontend
npm install
npm run dev
```

## 14. Easiest method using the included BAT files

After packages are installed:

1. Double-click `start-backend.bat`.
2. Double-click `start-frontend.bat`.
3. Open the Vite URL shown by the frontend terminal.

The two terminal windows must remain open while you use the website.
