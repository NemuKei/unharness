import { layerManifestKey } from '../appearance-layers';
import { preparedAppearances } from '../prepared-appearances';
import type { ArtworkItem } from '../artwork';
import type { PreparedAppearanceId } from '../prepared-appearances';

export type AppearanceTheme = PreparedAppearanceId | 'neutral';

export function appearanceThemeFor(item: ArtworkItem | null): AppearanceTheme {
  if (!item) return 'default';
  if (item.kind !== 'layered') return 'neutral';
  const key = layerManifestKey(item.manifest);
  return preparedAppearances.find(look => layerManifestKey(look.artwork.manifest) === key)?.id ?? 'neutral';
}
