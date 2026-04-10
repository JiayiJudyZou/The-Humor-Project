export default function ProtectedTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="route-enter w-full">{children}</div>;
}
