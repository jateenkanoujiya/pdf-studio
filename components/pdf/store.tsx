"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
export type HistoryItem = {
  id: string;
  name: string;
  tool: string;
  date: number;
  size: number;
};
type Store = {
  theme: string;
  toggleTheme: () => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  history: HistoryItem[];
  addHistory: (v: Omit<HistoryItem, "id" | "date">) => void;
  clearHistory: () => void;
};
const Context = createContext<Store | null>(null);
export function StudioProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState("dark");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setTheme(localStorage.getItem("studio-theme") || "dark");
      setFavorites(
        JSON.parse(localStorage.getItem("studio-favorites") || "[]"),
      );
      setHistory(JSON.parse(localStorage.getItem("studio-history") || "[]"));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (ready) {
      try {
        localStorage.setItem("studio-theme", theme);
        localStorage.setItem("studio-favorites", JSON.stringify(favorites));
        localStorage.setItem("studio-history", JSON.stringify(history));
      } catch {}
    }
  }, [theme, favorites, history, ready]);
  return (
    <Context.Provider
      value={{
        theme,
        toggleTheme: () => setTheme((v) => (v === "dark" ? "light" : "dark")),
        favorites,
        toggleFavorite: (id) =>
          setFavorites((v) =>
            v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
          ),
        history,
        addHistory: (v) =>
          setHistory((h) =>
            [{ ...v, id: crypto.randomUUID(), date: Date.now() }, ...h].slice(
              0,
              20,
            ),
          ),
        clearHistory: () => setHistory([]),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStudio() {
  const v = useContext(Context);
  if (!v) throw Error("StudioProvider missing");
  return v;
}
