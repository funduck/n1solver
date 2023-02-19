# N1Solver
Solves N+1 problem when it is possible to merge requests and run one query instead of many.

RequestMerger merges requests into groups that will be executed together.

RequestRunner is original runner of requests, for example http request or a call to database driver.

## RequestMergerByField
Is a merger for requests like `{<field>:<value>, ...<other conditions>}`.
For example `{userId: 42, deletedAt: null}`.

## N1SolverByField
For convenience instead of importing and instantiating both solver and merger you can take only **N1SolverByField**.

TODO example of use and describe how it works (compare to dataloader).
