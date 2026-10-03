import { runExperiment, processDriver } from "../dist/index.js";
const driver = {
  ...processDriver,
  name: "example-process-adapter",
  details: { ...processDriver.details, example: "public Driver composition" },
  async run(context) {
    context.fixture.add("driver", "journey.started", {
      adapter: "example-process-adapter",
    });
    return processDriver.run(context);
  },
};
const result = await runExperiment({
  scenario: "booking",
  variant: "fixed",
  driver,
  output: "runs/adapter",
});
console.log(`${result.verdict}: ${result.id}`);
process.exitCode = result.verdict === "PASS" ? 0 : 1;
