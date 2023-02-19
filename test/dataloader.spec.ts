import * as DataLoader from "dataloader";

describe("Dataloader (from facebook)", () => {
  type RunnerArgs = {
    field: number;
    deletedAt?: any;
  };
  type Res = { field: number };

  const countRunnerCalls = jest.fn();

  const runner = async (a: RunnerArgs[]): Promise<Res[]> => {
    // console.log(`Runner called with args: ${JSON.stringify(a, null, 2)}`);

    // need to transform array to one condition
    const { field, ...rest } = a[0];
    const mongoArgs = {
      field: { $in: a.map((x) => x.field) },
      ...rest,
    };

    countRunnerCalls();
    return new Array(100)
      .fill(null)
      .map((_, i) => ({
        field: i,
      }))
      .filter((val) => mongoArgs.field.$in.includes(val.field));
  };

  // We initiate one dataloader for every type of conditions
  const dataloader = new DataLoader(runner, { cache: false, maxBatchSize: 2 });

  it("Run below maxBatchSize", async () => {
    countRunnerCalls.mockClear();
    const promises = [];
    promises.push(dataloader.load({ field: 12 }));
    promises.push(dataloader.load({ field: 45 }));
    await Promise.all(promises);
    expect(countRunnerCalls).toHaveBeenCalledTimes(1);
  });

  it("Run over maxBatchSize", async () => {
    countRunnerCalls.mockClear();
    const promises = [];
    promises.push(dataloader.load({ field: 12 }));
    promises.push(dataloader.load({ field: 45 }));
    promises.push(dataloader.load({ field: 67 }));
    await Promise.all(promises);
    expect(countRunnerCalls).toHaveBeenCalledTimes(2);
  });
});
