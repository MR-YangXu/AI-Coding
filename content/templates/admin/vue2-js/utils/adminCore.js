/** 克隆查询和配置的可变部分，保留回调；日期不转成字符串。 */
export function clone(value) {
    if (value instanceof Date)
        return new Date(value.getTime());
    if (Array.isArray(value))
        return value.map(clone);
    if (value && Object.getPrototypeOf(value) === Object.prototype)
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
}
export function createListController(initialQuery, initialOptions) {
    let options = initialOptions;
    const initial = clone(options.initialQuery);
    let state = { query: clone(initialQuery), tableData: [], total: 0, loading: false, error: null };
    let sequence = 0;
    let active = true;
    const listeners = new Set();
    const publish = (patch) => {
        state = { ...state, ...patch };
        listeners.forEach((listener) => listener());
    };
    const updateQuery = (patch) => publish({ query: { ...state.query, ...clone(patch) } });
    const pageParams = () => ({
        currentPage: Number(state.query.page) || 1,
        pageSize: Number(state.query.page_size) || 10,
        pageSizes: state.query.page_sizes ?? [10, 20, 50, 100],
        total: state.total,
    });
    const getData = async () => {
        if (!active)
            return;
        const ticket = ++sequence;
        publish({ loading: true, error: null, ...(options.keepPrevious ? {} : { tableData: [] }) });
        const query = clone(state.query);
        // 仅移除工具集自己的展示状态；业务字段保持原样。
        delete query.total;
        delete query.page_sizes;
        try {
            let result = await options.fetchList(query);
            if (!active || ticket !== sequence)
                return;
            const validate = (value) => {
                if (!value || !Array.isArray(value.list) || !Number.isFinite(value.total) || value.total < 0)
                    throw new Error('fetchList 必须返回 { list: 数组, total: 非负数 }');
            };
            validate(result);
            const lastPage = Math.max(1, Math.ceil(result.total / pageParams().pageSize));
            if (pageParams().currentPage > lastPage) {
                updateQuery({ page: lastPage });
                result = await options.fetchList({ ...query, page: lastPage });
                if (!active || ticket !== sequence)
                    return;
                validate(result);
            }
            publish({ tableData: result.list, total: result.total });
            if (options.persistKey && typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(options.persistKey, JSON.stringify({ page: state.query.page, page_size: state.query.page_size }));
                }
                catch {
                    /* 分页记忆属于可选增强，存储失败不使已成功的查询失败。 */
                }
            }
            return result;
        }
        catch (error) {
            if (active && ticket === sequence) {
                publish({ error });
                options.onError?.(error);
            }
            // 查询错误通过 error/onError 暴露，模板事件不会产生未处理拒绝。
            return undefined;
        }
        finally {
            if (active && ticket === sequence)
                publish({ loading: false });
        }
    };
    return {
        getSnapshot: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        setOptions: (next) => {
            options = next;
        },
        activate: () => {
            active = true;
        },
        dispose: () => {
            active = false;
            sequence++;
        },
        pageParams,
        getData,
        onSubmit: (form) => {
            updateQuery({ ...form, page: 1 });
            return getData();
        },
        handlePageChange: ({ pageNum }) => {
            updateQuery({ page: pageNum });
            return getData();
        },
        handleSizeChange: ({ pageSize }) => {
            updateQuery({ page: 1, page_size: pageSize });
            return getData();
        },
        reset: () => {
            sequence++;
            publish({ query: { ...clone(initial), page: 1 }, error: null, loading: false });
            return options.isRefreshData === false ? Promise.resolve(undefined) : getData();
        },
        restorePagination: () => {
            if (!options.persistKey || typeof localStorage === 'undefined')
                return;
            try {
                const saved = JSON.parse(localStorage.getItem(options.persistKey) ?? 'null');
                if (saved &&
                    Number.isInteger(saved.page) &&
                    saved.page > 0 &&
                    Number.isInteger(saved.page_size) &&
                    saved.page_size > 0)
                    updateQuery({ page: saved.page, page_size: saved.page_size });
            }
            catch {
                /* 忽略损坏或不可用的可选分页缓存。 */
            }
        },
    };
}
export function getFiltedOptions(raw, map) {
    return raw.map((entry) => {
        if (!entry || typeof entry !== 'object')
            throw new Error('选项必须为对象');
        const record = entry;
        const value = record[map.value];
        if (!['string', 'number', 'boolean'].includes(typeof value) || record[map.key] === undefined)
            throw new Error('选项映射字段缺失或类型不支持');
        return { label: String(record[map.key]), value: value };
    });
}
export function createOptionsController(write) {
    const tickets = new Map();
    let active = true;
    const next = (field) => {
        const id = (tickets.get(field) ?? 0) + 1;
        tickets.set(field, id);
        return id;
    };
    return {
        activate: () => {
            active = true;
        },
        dispose: () => {
            active = false;
            tickets.forEach((_, key) => next(key));
        },
        setFieldOptions: (field, raw, map) => {
            next(field);
            if (active)
                write(field, getFiltedOptions(raw, map));
        },
        loadFieldOptions: async (field, fetcher, map) => {
            const id = next(field);
            try {
                const raw = await fetcher();
                if (active && tickets.get(field) === id)
                    write(field, getFiltedOptions(raw, map));
            }
            catch (error) {
                if (active && tickets.get(field) === id)
                    throw error;
            }
        },
    };
}
export function createActionController(refresh, notify, onPending) {
    const pending = new Map();
    let generation = 0;
    let active = true;
    return {
        activate: () => {
            active = true;
        },
        dispose: () => {
            active = false;
            generation++;
            pending.clear();
        },
        exec: (task, success, key = 'default') => {
            if (!active)
                return Promise.reject(new Error('操作所属组件已销毁'));
            if (pending.has(key))
                return pending.get(key);
            const ticket = generation;
            const promise = Promise.resolve()
                .then(task)
                .then(async (result) => {
                if (active && ticket === generation) {
                    const message = typeof success === 'function' ? success(result) : success;
                    if (message)
                        notify?.(message);
                    await refresh?.();
                }
                return result;
            })
                .finally(() => {
                if (active && ticket === generation) {
                    pending.delete(key);
                    onPending?.([...pending.keys()]);
                }
            });
            pending.set(key, promise);
            onPending?.([...pending.keys()]);
            return promise;
        },
    };
}
