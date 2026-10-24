import { LEGACY_TABLE } from "@rentmate/types";
import { productName } from "@rentmate/ui";

export default function HomePage() {
  return (
    <main>
      <h1>{productName}</h1>
      <p>Web application skeleton. Production operators still use the Telegram Mini App.</p>
      <p>
        Live tenant table: <code>{LEGACY_TABLE.organizations}</code> (mapped as
        Organization). Vehicles table: <code>{LEGACY_TABLE.vehicles}</code>.
      </p>
    </main>
  );
}
