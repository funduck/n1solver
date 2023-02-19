import { RequestMergerByField } from "@src/request-merger-by-field";
import { N1Solver } from "@src/solver";
import { sleep } from "@test/sleep";

describe("N1SolverByField", () => {
  type RunnerArgs = {
    field: { $in: number[] };
    deletedAt?: any;
  };
  type Res = { field: number };

  const countRunnerCalls = jest.fn();

  const runner = async (a: RunnerArgs): Promise<Res[]> => {
    // console.log(`Runner called with args: ${JSON.stringify(a, null, 2)}`);
    countRunnerCalls();
    return new Array(100)
      .fill(null)
      .map((_, i) => ({
        field: i,
      }))
      .filter((val) => a.field.$in.includes(val.field));
  };

  const merger = new RequestMergerByField("field");
  const solver = new N1Solver(merger, runner);

  it("Check runner", async () => {
    const res = await runner({ field: { $in: [10] } });
    expect(res.length).toBe(1);
    expect(res[0].field).toBe(10);
  });

  it("Check merger", () => {
    const groups = merger.merge([
      {
        args: { field: 10 },
        callback: {
          resolve: () => null,
          reject: () => null,
        },
      },
      {
        args: { field: 14 },
        callback: {
          resolve: () => null,
          reject: () => null,
        },
      },

      {
        args: { field: 21, deletedAt: null },
        callback: {
          resolve: () => null,
          reject: () => null,
        },
      },
      {
        args: { field: 24, deletedAt: null },
        callback: {
          resolve: () => null,
          reject: () => null,
        },
      },

      {
        args: {
          field: 33,
          deletedAt: 1999,
        },
        callback: {
          resolve: () => null,
          reject: () => null,
        },
      },
      {
        args: {
          field: 34,
          deletedAt: 1999,
        },
        callback: {
          resolve: () => null,
          reject: () => null,
        },
      },
    ]);
    expect([...groups].length).toBe(3);
    // console.log(JSON.stringify(groups, null, 2));
  });

  it("Check solver", async () => {
    expect(solver.load({ field: 1 })).resolves.toEqual([{ field: 1 }]);
    expect(solver.load({ field: 200 })).resolves.toEqual([]);
  });

  it("Run several tasks and have only 1 call to runner", async () => {
    countRunnerCalls.mockClear();
    const promises = [solver.load({ field: -1 }), solver.load({ field: 1 }), solver.load({ field: 111 })];
    await Promise.all(promises);
    expect(countRunnerCalls.mock.calls.length).toBe(1);
  });

  it("Run tasks in solver with delay", async () => {
    countRunnerCalls.mockClear();
    const solver = new N1Solver(merger, runner, { executionDelayMsec: 100 });
    const startedAt = Date.now();
    const promises = [solver.load({ field: 1 })];
    await sleep(90);
    promises.push(solver.load({ field: 2 }));
    await Promise.all(promises);
    expect(Date.now() - startedAt).toBeGreaterThan(99);
    expect(countRunnerCalls.mock.calls.length).toBe(1);
  });

  it("Run tasks in solver hitting maxQueryLength", async () => {
    countRunnerCalls.mockClear();

    const merger = new RequestMergerByField("field", { maxQueryLength: 2 });
    const solver = new N1Solver(merger, runner);

    await Promise.all([solver.load({ field: 1 }), solver.load({ field: 2 }), solver.load({ field: 3 })]);

    expect(countRunnerCalls.mock.calls.length).toBe(2);
  });

  it("Run tasks in solver not hitting maxQueryLength", async () => {
    countRunnerCalls.mockClear();

    const merger = new RequestMergerByField("field", { maxQueryLength: 3 });
    const solver = new N1Solver(merger, runner);

    await Promise.all([solver.load({ field: 1 }), solver.load({ field: 2 }), solver.load({ field: 3 })]);

    expect(countRunnerCalls.mock.calls.length).toBe(1);
  });
});
