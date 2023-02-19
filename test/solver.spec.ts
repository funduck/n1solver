import { Request, RequestGroup, N1Solver } from "@src/solver";

describe("Solver", () => {
  type Args = { id: { $in: number[] } };
  type Res = number;

  const countRunnerCalls = jest.fn();

  const runner = async (a: Args): Promise<Res[]> => {
    // console.log(`Runner called with args: ${JSON.stringify(a, null, 2)}`);
    countRunnerCalls();
    return new Array(100)
      .fill(null)
      .map((_, i) => i)
      .filter((i) => a.id.$in.includes(i));
  };

  const merger = {
    merge: (requests: Request<Args, Res>[]): RequestGroup<Args, Res>[] => {
      const mapArgToTaskIds: Map<number, number[]> = new Map();
      const args = { id: { $in: [] } };

      for (let i = 0; i < requests.length; i++) {
        for (const id of requests[i].args.id.$in) {
          const taskIds = mapArgToTaskIds.get(id) || [];
          taskIds.push(i);
          if (taskIds.length == 1) {
            mapArgToTaskIds.set(id, taskIds);
          }
        }
      }

      const resultDispatcher = (resultItem: Res) => {
        return mapArgToTaskIds.get(resultItem);
      };

      args.id.$in.push(...mapArgToTaskIds.keys());

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

  it("Check runner", async () => {
    const res = await runner({ id: { $in: [10] } });
    expect(res.length).toBe(1);
    expect(res[0]).toBe(10);
  });

  it("Check merger", () => {
    const groups = merger.merge([
      {
        args: { id: { $in: [10] } },
        callback: {
          resolve: () => null,
          reject: () => null,
        },
      },
      {
        args: { id: { $in: [12, 15] } },
        callback: {
          resolve: () => null,
          reject: () => null,
        },
      },
    ]);
    expect(groups.length).toBe(1);
    // console.log(JSON.stringify(groups, null, 2));
  });

  it("Run several tasks and have only 1 call to runner", async () => {
    countRunnerCalls.mockClear();

    const run = (ids: number[], count: number) => {
      return solver.load({ id: { $in: ids } }).then((res) => {
        // console.log(`Run(${ids}) returned ${JSON.stringify(res)}`);
        expect(res.length).toBe(count);
      });
    };

    const promises = [run([25, 130], 1), run([35, 40], 2)];

    await Promise.all(promises);

    expect(countRunnerCalls.mock.calls.length).toBe(1);
  });
});
