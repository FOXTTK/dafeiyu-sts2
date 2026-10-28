/** Package entry: the default export is the `WorldDefinition`. */
import { STS2 } from './definition.ts';

export default STS2;

export { STS2 };
export { STS2_CONFIG_GROUP, STS2_DEFAULTS, type Sts2ConfigSection } from './config.ts';
export { Sts2World, baseUrlOf, buildActionPayload, type Sts2WorldOptions } from './world.ts';
export { Sts2Client, normalize, type Sts2View, type Sts2Health, type Sts2ActionResult } from './protocol.ts';
export { renderView, renderActionResult, screenName } from './render.ts';
export { STS2_TOOL_DECLS } from './tools.ts';
