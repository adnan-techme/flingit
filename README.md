# FlingIt

FlingIt is a frictionless, browser-based peer-to-peer file sharing application. It allows devices on the same network to discover each other automatically and share files with zero setup.

![FlingIt UI](public/screenshot.png) 
<!-- Note: You might want to add a screenshot here later -->

## Features

- **Zero-Configuration**: Automatically discovers devices on the same network node (using basic IP heuristics).
- **Peer-to-Peer**: Fast file transfer directly between devices using WebSockets.
- **Batch Sharing**: Select and send multiple files at once.
- **No Size Limits**: Uses chunked transfer to handle large files efficiently.
- **Material Design**: Clean, modern UI with interactive 3D tilt effects.
- **Cross-Platform**: Works on any device with a modern web browser (Desktop, iOS, Android).

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- npm (Node Package Manager)

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/flingit.git
    cd flingit
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Usage

1.  Start the server:
    ```bash
    npm start
    ```
    For development with auto-restart:
    ```bash
    npm run dev
    ```

2.  Open your browser and navigate to:
    `http://localhost:3000`

3.  Open the same URL on another device connected to the same Wi-Fi/Network.

4.  The devices should automatically discover each other. Drag and drop files to start sharing!

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (Variables, Animations)
- **Real-time Communication**: WebSockets (via Socket.io)

## Deployment

Designed to be deployed on platforms like [Render](https://render.com/), Heroku, or Railway. Ensure "Session Affinity" (Sticky Sessions) is enabled if scaling beyond a single instance, though this implementation is primarily designed for single-node relay.

## License

MIT
