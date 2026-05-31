// Imports every Tests/*.Test.js so they register, then runs the harness.
// Static import list (buildless ESM — no fs glob). Append new suites here.
import { run } from "./Runner.js";

import "./Runner.Test.js";
import "./Clock.Test.js";
import "./StorageAdapter.Test.js";
import "./ContentShapes.Test.js";
import "./ContentTree.Test.js";
import "./GameState.Test.js";
import "./ContentIntegrity.Test.js";
import "./Topology.Test.js";
import "./RateSolver.Test.js";
import "./Tick.Test.js";
import "./Economy.Test.js";

// Optional substring filter: `node Tests/RunAll.js Clock` runs only suites whose label contains "Clock".
run(process.argv[2]);
