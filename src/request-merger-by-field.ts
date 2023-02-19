import { Request, RequestGroup, RequestMerger, ResultDispatcher } from "./solver";

type FieldValue = string | number;

type AnyArgs = { [K in keyof any]?: any };

export type ArgsFieldInArray<FieldName extends string> = { [key in FieldName]: { $in: FieldValue[] } } & AnyArgs;

export type ArgsFieldValue<FieldName extends string> = { [key in FieldName]: FieldValue } & AnyArgs;

export type ResultWithField<FieldName extends string> = { [key in FieldName]: FieldValue };

type ResultsDispatcherMap = Map<FieldValue, number[]>;

export class RequestMergerByField<
  FieldName extends string,
  Result extends ResultWithField<FieldName>,
  Args extends ArgsFieldValue<FieldName> = ArgsFieldValue<FieldName>,
  RunnerArgs extends ArgsFieldInArray<FieldName> = ArgsFieldInArray<FieldName>
> implements RequestMerger<Args, RunnerArgs, Result>
{
  private maxQueryLength: number;
  private forceSingleGroup: boolean;

  constructor(
    private readonly field: FieldName,

    options: {
      /**
       * Depending on runner, too big '$in' condition may reduce performance.
       * Default maxQueryLength is 100.
       * If merger sees query with more items it will try and split requests to smaller groups.
       * Or may be your runner performs well with even higher numbers.
       * Choose what is best for your runner.
       */
      maxQueryLength?: number;
      /**
       * If set to true, will force single group for all requests.
       * It improves performance but use with caution, only if you are 100% sure that requests can be merged to one query.
       */
      forceSingleGroup?: boolean;
    } = {}
  ) {
    this.maxQueryLength = options.maxQueryLength ?? 100;
    this.forceSingleGroup = options.forceSingleGroup ?? false;
  }

  merge(bufferedRequests: Request<Args, Result>[]): Iterable<RequestGroup<RunnerArgs, Result>> {
    if (bufferedRequests.length === 1) {
      return [
        this.buildGroup(
          this.getCommonArgs(bufferedRequests[0]),
          [bufferedRequests[0].args[this.field]],
          bufferedRequests,
          () => [0]
        ),
      ];
    }

    const res: RequestGroup<RunnerArgs, Result>[] = [];

    // We keep building groups until we reach maxQueryLength.

    const groupDtoMap: Map<
      string,
      {
        requests: Request<Args, Result>[];
        dispatcherMap: ResultsDispatcherMap;
        resultDispatcher: ResultDispatcher<Result>;
        values: Set<FieldValue>;
        commonArgs: Omit<Args, FieldName>;
      }
    > = new Map();

    for (const request of bufferedRequests) {
      const commonArgs = this.getCommonArgs(request);
      const key = this.getGroupKey(commonArgs);
      const value = request.args[this.field];

      let groupDto = groupDtoMap.get(key);

      // Group exists
      if (groupDto) {
        const requests = groupDto.requests;
        const values = groupDto.values;

        // Group may grow
        if (values.size < this.maxQueryLength || values.has(value)) {
          requests.push(request);
          const requestIndex = requests.length - 1;

          const dispatcherMap = groupDto.dispatcherMap;
          const indexesForValue = dispatcherMap.get(value) ?? [];
          indexesForValue.push(requestIndex);
          if (indexesForValue.length === 1) {
            dispatcherMap.set(value, indexesForValue);
          }

          values.add(value);

          continue;
        }

        // Group is full
        const group = this.buildGroup(
          groupDto.commonArgs,
          groupDto.values,
          groupDto.requests,
          groupDto.resultDispatcher
        );

        // resetting Maps to build group from scratch
        groupDtoMap.delete(key);

        res.push(group);

        // no continue, because we didn't add request to group
      }

      // New group

      // requests
      const requests = [request];
      const requestIndex = 0;

      // resultDispatcher
      const dispatcherMap: ResultsDispatcherMap = new Map();
      const indexesForValue = [requestIndex];
      dispatcherMap.set(value, indexesForValue);

      // Initialising resultDispatcher
      const resultDispatcher: ResultDispatcher<Result> = (resultItem: Result) => {
        const value = resultItem[this.field];
        const indexesForValue = dispatcherMap.get(value);
        return indexesForValue;
      };

      // values
      const values = new Set([value]);

      groupDtoMap.set(key, {
        requests,
        dispatcherMap,
        resultDispatcher,
        values,
        commonArgs,
      });
    }

    // Returning rest groups
    for (const dto of groupDtoMap.values()) {
      res.push(this.buildGroup(dto.commonArgs, dto.values, dto.requests, dto.resultDispatcher));
    }

    return res;
  }

  private getCommonArgs(request: Request<Args, Result>) {
    const commonFilter = { ...request.args };
    delete commonFilter[this.field];
    return commonFilter as Omit<Args, FieldName>;
  }

  private getGroupKey(commonFilter: Omit<Args, FieldName>): string {
    if (this.forceSingleGroup) return "singleGroup";
    return JSON.stringify(commonFilter);
  }

  private buildGroup(
    commonArgs: Omit<Args, FieldName>,
    values: FieldValue[] | Set<FieldValue>,
    requests: Request<Args, Result>[],
    resultDispatcher: ResultDispatcher<Result>
  ): RequestGroup<RunnerArgs, Result> {
    const fieldValues = Array.isArray(values) ? values : [...values.keys()];
    return {
      args: {
        ...commonArgs,
        [this.field]: { $in: fieldValues },
      } as unknown as RunnerArgs,
      requests,
      resultDispatcher,
    };
  }
}
