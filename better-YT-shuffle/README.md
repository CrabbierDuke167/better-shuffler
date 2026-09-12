# YouTube Mix Shuffler v1.2

A Chrome MV3 extension that creates a one-pass shuffled queue from the current YouTube Mix (which sucks without us).

<p align="center">
  <img src="assets/img3.png" alt="YouTube Mix Shuffler" width="500">
</p>

## v1.0.0 includes:

- Strict queue order: YouTube cannot replace the next queued song with its own autoplay choice.
- Each queued video ID appears only once per shuffle cycle.
- The queue index is advanced only by the extension, never by the current URL.
- Popup reports the real queue size and current position.

## Install

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.
5. Open a YouTube watch page containing a Mix.
6. Click **Shuffle this mix**.

After updating an existing installation, click **Reload** for the extension and refresh the YouTube tab.

## Built With

<p align="center">

<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
<img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
<img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" />
<img src="https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome" />
<img src="https://img.shields.io/badge/Manifest%20V3-34A853?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome MV3" />
<img src="https://img.shields.io/badge/VS%20Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="VS Code" />

</p>

## Screenshots

<p align="center">
  <img src="assets/img1.png" alt="YouTube Mix Shuffler screenshot" width="500">
</p>

<p align="center">
  <img src="assets/img2.png" alt="YouTube Mix Shuffler screenshot" width="500">
</p>

## License

This project is licensed under the MIT License.
See the `LICENSE` file for details.
