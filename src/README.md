# FPL Stats - Modular Architecture

This document outlines the modular structure and conventions used in the FPL Stats application.

## 📁 Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── fixtures/          # Fixtures page
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── ui/               # Base UI components (shadcn/ui)
│   ├── layout/           # Layout components (Header, Footer)
│   ├── features/         # Feature-specific components
│   │   └── fixtures/     # Fixture-related components
│   └── common/           # Shared components (ThemeToggle)
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and business logic
├── types/                # TypeScript type definitions
├── services/             # API and external service integrations
└── constants/            # App constants and configurations
```

## 🏗️ Architecture Principles

### 1. **Separation of Concerns**
- **Components**: Handle UI and user interactions
- **Hooks**: Manage state and side effects
- **Services**: Handle external API calls
- **Types**: Define data structures
- **Constants**: Centralize configuration

### 2. **Feature-Based Organization**
- Feature-specific components go in `components/features/{feature-name}/`
- Each feature can have its own components, hooks, and types
- Shared components go in `components/common/` or `components/ui/`

### 3. **Custom Hooks Pattern**
- Extract reusable logic into custom hooks
- Hooks should be focused and single-purpose
- Use TypeScript for better type safety

## 📝 Conventions

### File Naming
- **Components**: PascalCase (e.g., `FixtureMatrix.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useFixtures.ts`)
- **Types**: camelCase (e.g., `fixtures.ts`)
- **Services**: camelCase with descriptive names (e.g., `fpl-api.ts`)

### Import Organization
```typescript
// 1. React and Next.js imports
import { useState, useEffect } from "react";
import Link from "next/link";

// 2. Third-party libraries
import { useReactTable } from "@tanstack/react-table";

// 3. Internal imports (alphabetical)
import { Badge } from "@/components/ui/badge";
import { useFixtures } from "@/hooks/useFixtures";
import { MatrixRow } from "@/types/fixtures";
```

### Component Structure
```typescript
// 1. Imports
// 2. Types (if component-specific)
// 3. Helper functions
// 4. Main component
// 5. Export
```

## 🔧 Adding New Features

### 1. **Create Types**
```typescript
// src/types/players.ts
export interface Player {
  id: number;
  name: string;
  // ... other properties
}
```

### 2. **Create Service**
```typescript
// src/services/players-api.ts
import { Player } from "@/types/players";

export class PlayersApiService {
  async getPlayers(): Promise<Player[]> {
    // Implementation
  }
}
```

### 3. **Create Hook**
```typescript
// src/hooks/usePlayers.ts
import { useState, useEffect } from "react";
import { Player } from "@/types/players";

export function usePlayers() {
  // Implementation
}
```

### 4. **Create Component**
```typescript
// src/components/features/players/PlayersList.tsx
import { usePlayers } from "@/hooks/usePlayers";

export default function PlayersList() {
  // Implementation
}
```

### 5. **Create Page**
```typescript
// src/app/players/page.tsx
import PlayersList from "@/components/features/players/PlayersList";

export default function PlayersPage() {
  return <PlayersList />;
}
```

## 🎯 Benefits

1. **Scalability**: Easy to add new features without affecting existing code
2. **Maintainability**: Clear separation makes debugging easier
3. **Reusability**: Components and hooks can be shared across features
4. **Type Safety**: Centralized types prevent inconsistencies
5. **Testing**: Isolated components and hooks are easier to test

## 🚀 Best Practices

1. **Keep components small and focused**
2. **Use custom hooks for complex logic**
3. **Centralize API calls in services**
4. **Use TypeScript for all new code**
5. **Follow the established naming conventions**
6. **Document complex business logic**
7. **Use constants for magic numbers and strings** 