<?php

namespace Pterodactyl\Services\Databases;

use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Database;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Extensions\DynamicDatabaseConnection;

/**
 * Looking at the data of a database of a server and changing it, for the data editor of the panel. It connects to the database host the
 * way the panel always does and stays inside the one database. Names of tables and columns are only ever taken from the database itself
 * (what was asked for has to be one of them) and every value is a bound parameter, so nothing a person types is part of the statement.
 */
class DatabaseDataService
{
    private const CONNECTION = 'server_database_data';

    // A value longer than this is cut when it is shown (and then not edited), the grid is not the place for a whole book.
    public const CELL = 400;

    private const BINARY = ['binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob', 'geometry', 'point', 'linestring', 'polygon'];

    public function __construct(private DynamicDatabaseConnection $dynamic)
    {
    }

    /**
     * The size of each database, one question per host.
     *
     * @param  iterable<Database>  $databases
     * @return array<int, array{bytes: int, tables: int}> by the id of the database
     */
    public function sizes(iterable $databases): array
    {
        $sizes = [];
        foreach (collect($databases)->groupBy('database_host_id') as $group) {
            try {
                $this->dynamic->set(self::CONNECTION, $group->first()->host);
                DB::purge(self::CONNECTION);
                $rows = DB::connection(self::CONNECTION)->select(
                    'SELECT TABLE_SCHEMA AS schema_name, COUNT(*) AS tables_count, COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA IN (' . implode(',', array_fill(0, $group->count(), '?')) . ") AND TABLE_TYPE = 'BASE TABLE' GROUP BY TABLE_SCHEMA",
                    $group->pluck('database')->all()
                );
            } catch (\Throwable) {
                // A host that does not answer has no sizes, the list is still there.
                continue;
            }

            $by = collect($rows)->keyBy('schema_name');
            foreach ($group as $database) {
                $row = $by->get($database->database);
                $sizes[$database->id] = ['bytes' => (int) ($row->bytes ?? 0), 'tables' => (int) ($row->tables_count ?? 0)];
            }
        }

        return $sizes;
    }

    /** @return array{tables: list<array{name: string, rows: int, bytes: int, engine: string|null}>, bytes: int} */
    public function tables(Database $database): array
    {
        $rows = $this->connect($database)->select(
            "SELECT TABLE_NAME AS name, COALESCE(TABLE_ROWS, 0) AS row_estimate, COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) AS bytes, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
            [$database->database]
        );

        $tables = array_map(fn ($row) => ['name' => $row->name, 'rows' => (int) $row->row_estimate, 'bytes' => (int) $row->bytes, 'engine' => $row->engine], $rows);

        return ['tables' => $tables, 'bytes' => array_sum(array_column($tables, 'bytes'))];
    }

    /**
     * One page of the rows of a table, with what the grid needs to draw and edit them.
     *
     * @return array<string, mixed>
     */
    public function rows(Database $database, string $table, int $page, int $perPage, ?string $sort, string $direction): array
    {
        $connection = $this->connect($database);
        $columns = $this->columns($database, $table);
        $names = array_column($columns, 'name');
        $perPage = max(1, min(100, $perPage));
        $page = max(1, $page);

        $select = implode(', ', array_map(fn (array $column) => $this->isBinary($column) ? 'OCTET_LENGTH(' . $this->q($column['name']) . ') AS ' . $this->q($column['name']) : $this->q($column['name']), $columns));
        $order = $sort !== null && in_array($sort, $names, true) ? ' ORDER BY ' . $this->q($sort) . ($direction === 'desc' ? ' DESC' : ' ASC') : '';

        $total = (int) $connection->selectOne('SELECT COUNT(*) AS total FROM ' . $this->q($table))->total;
        $rows = $connection->select('SELECT ' . $select . ' FROM ' . $this->q($table) . $order . ' LIMIT ' . $perPage . ' OFFSET ' . (($page - 1) * $perPage));

        $primary = array_values(array_column(array_filter($columns, fn (array $c) => $c['key'] === 'PRI'), 'name'));

        return [
            'table' => $table,
            'columns' => $columns,
            'primary' => $primary,
            'editable' => $primary !== [],
            'rows' => array_map(fn ($row) => $this->shown((array) $row, $columns), $rows),
            'pagination' => ['total' => $total, 'count' => count($rows), 'per_page' => $perPage, 'current_page' => $page, 'total_pages' => max(1, (int) ceil($total / $perPage))],
        ];
    }

    /**
     * @param  array<string, mixed>  $values  column => value (null is NULL)
     *
     * @throws DisplayException
     */
    public function insert(Database $database, string $table, array $values): void
    {
        $connection = $this->connect($database);
        $columns = $this->writable($database, $table, $values);
        if ($columns === []) {
            $connection->insert('INSERT INTO ' . $this->q($table) . ' () VALUES ()');

            return;
        }

        $connection->insert(
            'INSERT INTO ' . $this->q($table) . ' (' . implode(', ', array_map(fn ($c) => $this->q($c), array_keys($columns))) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')',
            array_values($columns)
        );
    }

    /**
     * @param  array<string, mixed>  $key  the whole primary key of the row
     * @param  array<string, mixed>  $values
     *
     * @throws DisplayException
     */
    public function update(Database $database, string $table, array $key, array $values): int
    {
        $connection = $this->connect($database);
        $where = $this->where($database, $table, $key);
        $columns = $this->writable($database, $table, $values);
        if ($columns === []) {
            throw new DisplayException('Nothing was changed.');
        }

        return $connection->update(
            'UPDATE ' . $this->q($table) . ' SET ' . implode(', ', array_map(fn ($c) => $this->q($c) . ' = ?', array_keys($columns))) . ' WHERE ' . $where['sql'] . ' LIMIT 1',
            [...array_values($columns), ...$where['bindings']]
        );
    }

    /**
     * @param  array<string, mixed>  $key
     *
     * @throws DisplayException
     */
    public function delete(Database $database, string $table, array $key): int
    {
        $connection = $this->connect($database);
        $where = $this->where($database, $table, $key);

        return $connection->delete('DELETE FROM ' . $this->q($table) . ' WHERE ' . $where['sql'] . ' LIMIT 1', $where['bindings']);
    }

    /** @return \Illuminate\Database\Connection */
    private function connect(Database $database): \Illuminate\Database\Connection
    {
        $this->dynamic->set(self::CONNECTION, $database->host, $database->database);
        DB::purge(self::CONNECTION);

        try {
            $connection = DB::connection(self::CONNECTION);
            $connection->getPdo();
        } catch (\Throwable $exception) {
            throw new DisplayException('The database server could not be reached: ' . $exception->getMessage());
        }

        return $connection;
    }

    /**
     * The columns of a table (which has to be one of the database), in their order.
     *
     * @return list<array{name: string, type: string, data_type: string, nullable: bool, key: string, extra: string, default: string|null, binary: bool, generated: bool}>
     *
     * @throws DisplayException
     */
    private function columns(Database $database, string $table): array
    {
        $rows = $this->connect($database)->select(
            'SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, DATA_TYPE AS data_type, IS_NULLABLE AS nullable, COLUMN_KEY AS col_key, EXTRA AS extra, COLUMN_DEFAULT AS col_default FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
            [$database->database, $table]
        );
        if ($rows === []) {
            throw new DisplayException('There is no table ' . $table . ' in this database.');
        }

        return array_map(fn ($row) => [
            'name' => $row->name,
            'type' => $row->type,
            'data_type' => strtolower($row->data_type),
            'nullable' => $row->nullable === 'YES',
            'key' => (string) $row->col_key,
            'extra' => (string) $row->extra,
            'default' => $row->col_default,
            'binary' => in_array(strtolower($row->data_type), self::BINARY, true),
            'generated' => str_contains(strtoupper((string) $row->extra), 'GENERATED'),
        ], $rows);
    }

    /** @param array{binary: bool} $column */
    private function isBinary(array $column): bool
    {
        return $column['binary'];
    }

    /**
     * What may be written: columns of the table that are not binary and not generated.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, string|null>
     *
     * @throws DisplayException
     */
    private function writable(Database $database, string $table, array $values): array
    {
        $columns = collect($this->columns($database, $table))->keyBy('name');
        $out = [];
        foreach ($values as $name => $value) {
            $column = $columns->get($name);
            if ($column === null) {
                throw new DisplayException('There is no column ' . $name . ' in ' . $table . '.');
            }
            if ($column['binary'] || $column['generated']) {
                throw new DisplayException('The column ' . $name . ' can not be changed here.');
            }
            if ($value !== null && !is_scalar($value)) {
                throw new DisplayException('The value of ' . $name . ' is not text or a number.');
            }
            if ($value === null && !$column['nullable']) {
                throw new DisplayException('The column ' . $name . ' can not be empty (NULL).');
            }
            $out[$name] = $value === null ? null : (string) $value;
        }

        return $out;
    }

    /**
     * A WHERE for exactly one row: the whole primary key, nothing else.
     *
     * @param  array<string, mixed>  $key
     * @return array{sql: string, bindings: list<string>}
     *
     * @throws DisplayException
     */
    private function where(Database $database, string $table, array $key): array
    {
        $primary = array_column(array_filter($this->columns($database, $table), fn (array $c) => $c['key'] === 'PRI'), 'name');
        if ($primary === []) {
            throw new DisplayException('This table has no primary key, so a single row can not be told from another. It can only be looked at.');
        }
        if (array_diff($primary, array_keys($key)) !== [] || array_diff(array_keys($key), $primary) !== []) {
            throw new DisplayException('The whole primary key of the row is needed (' . implode(', ', $primary) . ').');
        }

        $sql = [];
        $bindings = [];
        foreach ($primary as $name) {
            if (!is_scalar($key[$name])) {
                throw new DisplayException('A key is text or a number.');
            }
            $sql[] = $this->q($name) . ' = ?';
            $bindings[] = (string) $key[$name];
        }

        return ['sql' => implode(' AND ', $sql), 'bindings' => $bindings];
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  list<array<string, mixed>>  $columns
     * @return array<string, mixed>
     */
    private function shown(array $row, array $columns): array
    {
        $out = [];
        foreach ($columns as $column) {
            $value = $row[$column['name']] ?? null;
            if ($column['binary']) {
                $out[$column['name']] = $value === null ? null : ['binary' => (int) $value];
            } elseif ($value === null) {
                $out[$column['name']] = null;
            } else {
                $text = (string) $value;
                $out[$column['name']] = mb_strlen($text) > self::CELL ? ['cut' => mb_substr($text, 0, self::CELL), 'length' => mb_strlen($text)] : $text;
            }
        }

        return $out;
    }

    private function q(string $identifier): string
    {
        return '`' . str_replace('`', '``', $identifier) . '`';
    }
}
