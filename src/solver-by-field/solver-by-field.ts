import { ResultWithField, ArgsFieldValue, RequestMergerByField, ArgsFieldInArray } from "./request-merger-by-field";
import { N1Solver, RequestRunner } from "../solver/solver";

/**
 * Solves N+1 problem for requests by field with some additional filters.
 * Requests are joined to minimum number of queries {<field>: {$in: [<value>,...],...}} and results are dispatched.
 * So, if you have requests like:
 *  {<field>: {$in: [<value>,...],...}}
 *  {<field>: [<value>,...],...}}
 *  {<field>: <value>,...}}
 * You can use one solver for them
 * solver.request(args)
 */
export class N1SolverByField<Result extends ResultWithField<FieldName>, FieldName extends string> extends N1Solver<
  ArgsFieldValue<FieldName>,
  ArgsFieldInArray<FieldName>,
  ResultWithField<FieldName>,
  Result
> {
  constructor(
    field: FieldName,
    requestRunner: RequestRunner<ArgsFieldInArray<FieldName>, Result>,
    options: { maxQueryLength?: number; executionDelayMsec?: number; forceSingleGroup?: boolean } = {}
  ) {
    const { maxQueryLength, executionDelayMsec, forceSingleGroup } = options;
    super(new RequestMergerByField(field, { maxQueryLength, forceSingleGroup }), requestRunner, { executionDelayMsec });
  }
}
