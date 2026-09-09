// Context admission for the registered-source core.
//
// The Codex native catalog moved to src/codex/catalog.mjs when the application
// seam was introduced. Validation is delegated to the adapter named by the
// context, so each application decides its own required fields while the core
// keeps one entry point.
import { applicationFor } from '../apps/index.mjs';

export const contextOf = (context) => applicationFor(context).contextOf(context);
