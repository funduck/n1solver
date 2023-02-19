import { ArgsFieldInArray } from "@src/request-merger-by-field";
import { N1Solver } from "@src/solver";
import { N1SolverByField } from "@src/solver-by-field";
import * as DataLoader from "dataloader";

describe("Benchmark Dataloader (from facebook) vs N1SolverByField", () => {
  const runner = async (a: ArgsFieldInArray<"field">) => {
    // console.log(`Runner called with args: ${JSON.stringify(a, null, 2)}`);
    const set = new Set(a.field.$in);
    return new Array(100)
      .fill(null)
      .map((_, i) => ({
        field: i,
      }))
      .filter((val) => set.has(val.field));
  };

  const solverByField = new N1SolverByField("field", runner, { maxQueryLength: 100, forceSingleGroup: true });

  const merger = {
    merge: (requests) => {
      const mapArgToTaskIds: Map<number, number[]> = new Map();

      for (let i = 0; i < requests.length; i++) {
        const value = requests[i].args.field;
        const ids = mapArgToTaskIds.get(value) || [];
        ids.push(i);
        if (ids.length == 1) {
          mapArgToTaskIds.set(value, ids);
        }
      }

      const resultDispatcher = (resultItem) => {
        return mapArgToTaskIds.get(resultItem.field);
      };

      const { field, ...rest } = requests[0].args;
      const args = {
        field: { $in: requests.map((x) => x.args.field) },
        ...rest,
      };

      return [
        {
          args,
          requests,
          resultDispatcher: resultDispatcher,
        },
      ];
    },
  };

  const solver = new N1Solver(merger, runner);

  const batchLoader = async (a) => {
    // need to transform array to one condition
    const { field, ...rest } = a[0];
    const mongoArgs = {
      field: { $in: a.map((x) => x.field) },
      ...rest,
    };

    return runner(mongoArgs);
  };

  const dataloader = new DataLoader(batchLoader, { cache: false, maxBatchSize: 100 });

  const direct = {
    load: (x) => {
      const { field, ...rest } = x;
      return runner({ field: { $in: [field] }, ...rest });
    },
  };

  beforeAll(async () => {
    for (const loader of [direct, solver, dataloader, solverByField]) {
      for (let i = 0; i < 100; i++) {
        for (let max = 10; max <= 100; max += 10) {
          const promises = new Array(max).fill(0).map((_, i) =>
            loader.load({
              field: i,
            })
          );
          await Promise.all(promises);
        }
      }
    }
  });

  for (const loader of [direct, solver, dataloader, solverByField]) {
    it(`Load many using ${loader.constructor.name}`, async () => {
      for (let i = 0; i < 1000; i++) {
        for (let max = 10; max <= 100; max += 10) {
          const promises = new Array(max).fill(0).map((_, i) =>
            loader.load({
              field: i,
            })
          );
          await Promise.all(promises);
        }
      }
    });
  }

  for (const loader of [direct, solver, dataloader, solverByField]) {
    it(`Load one using ${loader.constructor.name}`, async () => {
      for (let i = 0; i < 100000; i++) {
        await loader.load({
          field: Math.floor(Math.random() * 100),
        });
      }
    });
  }
});
