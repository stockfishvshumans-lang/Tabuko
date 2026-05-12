# Tabuko Chess Club — Tournament Management System

Welcome to **Tabuko**, a comprehensive tournament management system with FIDE-compliant Swiss pairing, advanced tie-breaks, and team tournament support.

## Features

✅ **FIDE-Compliant Swiss Pairing** — Industry-standard tournament pairings  
✅ **Advanced Tie-Break System** — Multiple tie-break criteria (Buchholz, Sonneborn, Median, etc.)  
✅ **Team Tournaments** — Full support for team-based competitions  
✅ **Real-Time Updates** — Live standings and player rankings  
✅ **PWA Support** — Works offline with service worker caching  
✅ **Firebase Integration** — Cloud-based data storage and authentication  
✅ **QR Code Generation** — Quick access to tournament information  

## Getting Started

1. Clone the repository
2. Navigate to the `TABUKO CHESS CLUB` folder
3. Open `index.html` in your browser
4. Configure Firebase credentials in `js/firebase-config.js`

## Project Structure

```
TABUKO CHESS CLUB/
├── index.html              # Main entry point
├── css/                    # Stylesheets
├── js/                     # JavaScript modules
│   ├── firebase-config.js # Firebase configuration
│   ├── db.js              # Database operations
│   ├── auth.js            # Authentication logic
│   ├── pairing-swiss.js   # Swiss pairing algorithm
│   ├── standings.js       # Tournament standings
│   └── app.js             # Main app router
├── manifest.json          # PWA manifest
└── sw.js                  # Service worker
```

## Technologies

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Firebase Firestore & Functions
- **Chess**: Chess.js, Chessboard.js
- **Build Tools**: Morphdom (DOM patching)
- **PWA**: Service Workers

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

[Add your license here]

## Support

For issues and questions, visit the [GitHub Issues](https://github.com/stockfishvshumans-lang/Tabuko/issues) page.

---

**Last Updated**: 2026-05-12
