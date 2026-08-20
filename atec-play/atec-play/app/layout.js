import "./globals.css";

export const metadata = {
  title: "ATEC PLAY",
  description: "통합 동호회 관리 시스템",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
