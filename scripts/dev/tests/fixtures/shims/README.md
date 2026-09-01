Executable shims used by individual tests. Each test builds its own
`bin/` directory with symlinks or scripts pointing here, then prepends
that directory to `PATH` for the assertion under test.
