import { LEGACY_TABLE } from "@rentmate/types";
import { brandName } from "@rentmate/ui";

export default function HomePage() {
  return (
    <main style={{ padding: "var(--mate-space-lg)" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "var(--mate-space-sm)" }}>
        {brandName}
      </h1>
      <p style={{ color: "var(--mate-text-muted)", maxWidth: 480 }}>
        Web skeleton with Mate OS tokens. Production operators still use the Telegram Mini App until
        login and fleet screens ship.
      </p>
      <p style={{ color: "var(--mate-text-muted)", fontSize: 14, marginTop: "var(--mate-space-md)" }}>
        Tenant table: <code>{LEGACY_TABLE.organizations}</code> · vehicles:{" "}
        <code>{LEGACY_TABLE.vehicles}</code>
      </p>
    </main>
  );
}
