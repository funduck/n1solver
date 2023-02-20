/**
 * RequestRunner is original runner of requests, for example http request or a call to database driver.
 */
export type RequestRunner<Args, Result> = (args: Args) => Promise<Result[]>;

type Callback<Result> = {
  resolve: (results: Result[]) => void;
  reject: (error: Error) => void;
};

export type Request<Args, Result> = {
  args: Args;
  callback: Callback<Result>;
};

/**
 * Function that determines request ids in group which should receive result.
 */
export type ResultDispatcher<R> = (resultItem: R) => number[];

/**
 * Group of requests with common 'args' that will be executed together.
 */
export type RequestGroup<Args, Result, A extends object = object> = {
  args: Args;
  requests: Request<A, Result>[];
  resultDispatcher: ResultDispatcher<Result>;
};

/**
 * RequestMerger merges requests into groups that will be executed together (RequestGroups).
 */
export interface RequestMerger<Args, RunnerArgs, Result> {
  merge: (bufferedRequests: Request<Args, Result>[]) => Iterable<RequestGroup<RunnerArgs, Result>>;
}

/**
 * Solves N+1 problem when it is possible to merge requests and run one instead of many.
 */
export class N1Solver<Args, RunnerArgs, ResultForMerger, Result extends ResultForMerger = ResultForMerger> {
  private requests: Request<Args, Result>[] = [];

  private executionDelayMsec: number;

  constructor(
    /**
     * RequestMerger merges requests into groups that will be executed together (RequestGroups).
     */
    private requestMerger: RequestMerger<Args, RunnerArgs, ResultForMerger>,
    /**
     * RequestRunner is original runner of requests, for example http request or a call to database driver.
     */
    private requestRunner: RequestRunner<RunnerArgs, Result>,
    options: {
      /**
       * Requests are executed with a little bit of delay, because it is the way they can be grouped together.
       * "0" is the default and is fastest.
       */
      executionDelayMsec?: number;
    } = {}
  ) {
    this.executionDelayMsec = options.executionDelayMsec ?? 0;
  }

  /**
   * Main method.
   * Rejects if any of requests in same group fails.
   */
  load(args: Args): Promise<Result[]> {
    return new Promise((resolve, reject) => {
      const request: Request<Args, Result> = {
        args,
        callback: {
          resolve,
          reject,
        },
      };

      this.requests.push(request);

      if (this.requests.length === 1) {
        this.queueTask(() => {
          this.execRequests();
        });
      }
    });
  }

  private queueTask(task: () => void) {
    if (this.executionDelayMsec == 0) {
      return queueMicrotask(task);
    }

    setTimeout(task, this.executionDelayMsec);
  }

  private execRequests() {
    if (this.requests.length === 0) {
      return;
    }
    const requests = this.requests;
    this.requests = [];

    try {
      let count = 0;
      const requestGroups = this.requestMerger.merge(requests);
      for (const group of requestGroups) {
        count++;
        this.execRequestsGroup(group);
      }

      // if (count < requests.length) {
      //   console.log(`NPlus1Solver saved ${requests.length - count} requests for you :)`);
      // } else {
      //   if (count > 1) {
      //     console.log(`NPlus1Solver failed to save any of ${requests.length} requests for you :(`);
      //   }
      // }
    } catch (err) {
      for (const request of requests) {
        request.callback.reject(err);
      }
    }
  }

  private execRequestsGroup(group: RequestGroup<RunnerArgs, Result>) {
    const { args, requests, resultDispatcher: resultDispatcher } = group;

    this.requestRunner(args).then(
      (results) => {
        const resultsPerRequest: Result[][] = requests.map(() => []);

        for (const resultItem of results) {
          const idxs = resultDispatcher(resultItem);
          for (const idx of idxs) {
            resultsPerRequest[idx].push(resultItem);
          }
        }

        for (let i = 0; i < requests.length; i++) {
          requests[i].callback.resolve(resultsPerRequest[i]);
        }
      },
      (err) => {
        for (const request of requests) {
          request.callback.reject(err);
        }
      }
    );
  }
}
