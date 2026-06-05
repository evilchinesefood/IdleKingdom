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
import "./SaveManager.Test.js";
import "./Offline.Test.js";
import "./Tick.Test.js";
import "./Economy.Test.js";
import "./ResearchSystem.Test.js";
import "./SiegeSystem.Test.js";
import "./Progression.Test.js";
import "./Intents.Test.js";
import "./Reducer.Test.js";
import "./Building.Test.js";
import "./NestedGroups.Test.js";
import "./UndoRedo.Test.js";
import "./Storage.Test.js";
import "./FanIn.Test.js";
import "./BulkDelete.Test.js";
import "./BulkInspector.Test.js";
import "./Paste.Test.js";
import "./Snapshot.Test.js";
import "./Game.Test.js";
import "./RenderCadence.Test.js";

// UI pure-helper suites
import "./BuildMenu.Test.js";
import "./Format.Test.js";
import "./CostFormat.Test.js";
import "./Dom.Test.js";
import "./GraphViewRetained.Test.js";
import "./Svg.Test.js";
import "./FormatHelpers.Test.js";
import "./Selectors.Test.js";
import "./IconMap.Test.js";
import "./Prefs.Test.js";
import "./Router.Test.js";

// Optional substring filter: `node Tests/RunAll.js Clock` runs only suites whose label contains "Clock".
run(process.argv[2]);
