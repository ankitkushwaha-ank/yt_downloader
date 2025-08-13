# YouTube Video Downloader


## Overview
This is a YouTube Video Downloader web application built with Flask that allows you to download YouTube videos in any available format — audio or video — ranging from 120p up to 4K quality.

Paste a YouTube link, preview available formats, and download the video/audio files quickly and easily.

## Features
- Download YouTube videos in multiple formats and resolutions (120p to 4K).
- Supports audio-only downloads.
- Clean, user-friendly web interface.
- Works on all major platforms: Windows, macOS, Android, Linux.
- Built with Flask backend and yt-dlp for fast and reliable video processing.
- Cross-Origin Resource Sharing (CORS) enabled.
## Screenshots

![Screenshot](/static/screenshots/3.png)
![Screenshot](/static/screenshots/1.png)
![Screenshot](/static/screenshots/2.png)
## Usage
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ankitkushwaha-ank/yt_downloader
    cd yt_downloader
    ```

2.  **Create a Python virtual environment and activate it:**
    ```bash
    # For macOS/Linux
    python3 -m venv venv
    source venv/bin/activate

    # For Windows
    python -m venv venv
    .\venv\Scripts\activate
    ```

3.  **Install the dependencies:**
    ```bash
    build.sh
    pip install -r requirements.txt
    ```

4.  **Run the Flask app:**
    ```bash
    python app.py
    ```

5.  **Open your browser and go to:**
    ```
    http://localhost:5000
    ```
    Paste the YouTube video link in the input box, select your desired format, and click **Download**.

## Tech Stack
- **Backend:** Python 3, Flask
- **Video Processing:** yt-dlp
- **Frontend:** HTML, CSS, JavaScript

## Notes
- Please only use this tool for videos you own or for videos that are copyright-free.
- An active internet connection is required to fetch video data from YouTube.

## License
This project is for educational and personal use only.