import { useState } from 'react';
import { SWITCH_STATE, type SwitchState } from '@/constants';
import { ORDER_STATUS, ORDER_STATUS_OPTIONS, type OrderStatus } from './constants';

export default function Orders() {
  const [query, setQuery] = useState<{ status: OrderStatus | null; enabled: SwitchState }>(() => ({ status: ORDER_STATUS.PENDING, enabled: SWITCH_STATE.ON }));
  return (
    <section>
      <label>订单状态
        <select value={query.status ?? ''} onChange={event => {
          const selected = ORDER_STATUS_OPTIONS.find(option => String(option.value) === event.target.value);
          setQuery(previous => ({ ...previous, status: selected?.value ?? null }));
        }}>
          <option value="">全部</option>
          {ORDER_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => setQuery({ status: null, enabled: SWITCH_STATE.ON })}>重置</button>
      <output data-status={query.status}>{query.status === ORDER_STATUS.COMPLETED ? '订单已完成' : ''}</output>
    </section>
  );
}
