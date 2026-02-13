import { Pacifico } from "next/font/google";

const pacifico = Pacifico({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export default function Home() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <h1
        className={`${pacifico.className} text-center text-6xl text-zinc-900 drop-shadow-sm sm:text-7xl`}
      >
        Hello World
      </h1>
    </div>
  );
}
