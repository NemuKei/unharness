// Setup versions and their writer fence share one lifecycle. Inventory v2
// already describes ordinary Skill states; custom instructions do not change it.
export const SETUP_VERSIONS = Object.freeze([1, 2, 3, 4]);
export const isSetupVersion = version => SETUP_VERSIONS.includes(version);
export const isVersionedSetup = version => isSetupVersion(version) && version >= 2;
export const usesSourceStates = version => isSetupVersion(version) && version >= 3;
export const setupInventoryVersion = version => usesSourceStates(version) ? 2 : 1;
