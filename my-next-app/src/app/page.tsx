import { Pacifico } from "next/font/google";

const pacifico = Pacifico({
  subsets: ["latin"],
  weight: "400",
});

export default function Home() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <h1
        className={`${pacifico.className} text-6xl text-zinc-900`}
        aria-live="polite"
      >
        Hello World
      </h1>
    </div>
  );
}
