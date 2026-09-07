import type { Api } from "./api";
import { ApiError } from "./api.ts";
import type { InventoryState } from "./inventory";

export async function readSourceInventory(
  api: Api,
  previous: InventoryState | null,
  inspect: boolean,
): Promise<{ inventory: InventoryState; status: "metadata" | "context-updated" | "inspected" }> {
  await api.connect();
  const metadata = await api.get<InventoryState>("/inventory");
  if (typeof metadata?.launchId !== "string" || metadata.launchId === ""
    || typeof metadata.enabled !== "boolean" || (metadata.enabled && typeof metadata.cwd !== "string")) {
    throw new ApiError("invalid-response");
  }
  if (!inspect) return { inventory: metadata, status: "metadata" };
  // The metadata and POST use one launch token. A restart between them is
  // rejected by the server, rather than silently reading a different context.
  if (metadata.launchId !== previous?.launchId || !metadata.enabled || !previous?.enabled || metadata.cwd !== previous.cwd) {
    return { inventory: metadata, status: "context-updated" };
  }
  const response = await api.post<{ result: InventoryState }>("/inspect", {});
  return { inventory: response.result, status: "inspected" };
}
