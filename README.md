# JobSeen

<div align="center">
  <h3>A modern, sleek job tracking and management platform.</h3>
  <p>Track your job applications, view them in list, grid, or Kanban board layouts, and connect with other users in the community.</p>
</div>

---

> **Note**: This project falls under **Arigato Labs**.

## 🚀 Features

- **Multi-Layout Views**: Easily switch between standard List, Multi-Column Grids, and an interactive Drag-and-Drop **Kanban Board**.
- **Real-time Status Tracking**: Keep tabs on your applications (Pending, Applied, Interview, Rejected, Selected) with instant UI updates.
- **Social Connect**: Find peers, send connection requests, and share or copy job application templates from others.
- **Real-time Chat**: Integrated messaging system to chat with your connections directly on the platform.
- **Fast & Lightweight**: Built using standard HTML5 APIs and modern React, keeping the footprint extremely minimal without heavy drag-and-drop libraries.

## 🛠️ Tech Stack

- **Framework**: [Astro](https://astro.build/) + [React](https://react.dev/)
- **Database & Auth**: [Firebase](https://firebase.google.com/) (Firestore, Auth)
- **Styling**: Custom CSS with a premium, sleek modern aesthetic (Glassmorphism, Dark Mode accents).
- **State Management**: [Nano Stores](https://github.com/nanostores/nanostores)

## 📦 Run on your own computer (Bit-by-Bit Guide)

Follow these exact steps if you want to run **JobSeen** on your local machine:

### Step 1: Prerequisites
Before you begin, make sure you have installed:
1. [Node.js](https://nodejs.org/) (Download and install the latest LTS version)
2. [Git](https://git-scm.com/downloads) (To clone the repository)

### Step 2: Clone the Code
Open your terminal (or Command Prompt / PowerShell) and run:
```bash
git clone https://github.com/your-username/jobseen.git
cd jobseen
```
*(Replace `your-username` with your actual GitHub username where you hosted this repo).*

### Step 3: Install Dependencies
Now that you are inside the `jobseen` folder, install all the required packages:
```bash
npm install
```
*Wait a minute or two for this to finish.*

### Step 4: Setup Firebase (Database & Auth)
JobSeen uses Firebase for storing data and Google Login.
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **"Add project"** and create a new project (e.g., `jobseen-local`).
3. Once created, click on the **Web icon (`</>`)** to register an app.
4. Firebase will give you a configuration object with keys like `apiKey`, `authDomain`, etc. Keep this tab open!
5. In the Firebase sidebar, go to **Authentication** > Get Started > Sign-in method > Enable **Google**.
6. Go to **Firestore Database** > Create Database > Start in **Test Mode** (or update rules later).

### Step 5: Configure Environment Variables
1. In your code editor (like VS Code), create a new file named exactly `.env` in the root folder of the project.
2. Copy the following template into the file and replace the values with the ones Firebase gave you in Step 4:
```env
PUBLIC_FIREBASE_API_KEY=your_api_key_here
PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=your_project_id
PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Step 6: Start the Server!
Finally, run the app:
```bash
npm run dev
```
Open your browser and go to **[http://localhost:4321](http://localhost:4321)**. You will see JobSeen running locally!

## 🚀 Deploying to Vercel

This project is fully optimized for **Vercel** deployments. 

1. Push your code to a GitHub repository.
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New Project**.
3. Import your GitHub repository.
4. Expand **Environment Variables** and paste in all the variables from your local `.env` file.
5. Click **Deploy**. Vercel will automatically detect the Astro framework and build the project perfectly.

---
*Created as part of Arigato Labs.*
