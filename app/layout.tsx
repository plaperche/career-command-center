import "./globals.css";
export const metadata = {
  title: "Career Command Center 2.0",
  description: "A focused workspace for your next chapter.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
