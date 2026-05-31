// Imports every Tests/*.Test.js so they register, then runs the harness.
// Static import list (buildless ESM — no fs glob). Append new suites here.
import { run } from "./Runner.js";

import "./Runner.Test.js";
import "./Clock.Test.js";
import "./StorageAdapter.Test.js";

// Optional substring filter: `node Tests/RunAll.js Clock` runs only suites whose label contains "Clock".
run(process.argv[2]);
