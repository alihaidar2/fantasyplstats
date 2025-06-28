# FPL Stats v3

Advanced Fantasy Premier League analytics and fixture tracking tool built with Next.js 15, React 19, and TypeScript.

## 🚀 Features

- **Fixture Matrix**: Interactive table showing team fixtures with difficulty ratings
- **Dark/Light Mode**: Toggle between themes with persistent preferences
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Real-time Data**: Fetches live data from the official FPL API
- **Incremental Static Regeneration**: Fast loading with CDN caching
- **TypeScript**: Full type safety throughout the application

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI + Custom components
- **Data Fetching**: Custom hooks with React Query patterns
- **Tables**: TanStack Table (React Table v8)
- **Icons**: Lucide React
- **Deployment**: Vercel (recommended)

## 🏃‍♂️ Quick Start

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ahaidar/fantasyplstats.git
cd fantasyplstats
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── fixtures/          # Fixtures page
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── common/           # Shared components
│   ├── features/         # Feature-specific components
│   ├── layout/           # Layout components
│   └── ui/               # Base UI components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and helpers
├── services/             # API service layer
├── types/                # TypeScript type definitions
└── constants/            # App constants
```

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Deploy automatically on every push

### Manual Deployment

```bash
npm run build
npm start
```

## 🔧 Environment Variables

No environment variables required for basic functionality. The app uses public FPL API endpoints.

## 📊 Data Sources

- **FPL API**: Official Fantasy Premier League API
- **Bootstrap Data**: Teams, players, and fixtures
- **Fixtures**: Real-time fixture information

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Fantasy Premier League](https://fantasy.premierleague.com/) for the API
- [Next.js](https://nextjs.org/) team for the amazing framework
- [Vercel](https://vercel.com/) for hosting and deployment

## 📈 Version History

- **v3.0.0**: Complete rewrite with Next.js 15, React 19, TypeScript, and modern architecture
- **v2.x**: Previous versions (legacy)
- **v1.x**: Initial releases

---

Built with ❤️ for the FPL community
