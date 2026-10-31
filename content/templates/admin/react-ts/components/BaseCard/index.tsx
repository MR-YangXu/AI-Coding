import { Card } from 'antd';
import type { ReactNode } from 'react';
export default function BaseCard({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <Card title={title} style={{ marginBottom: 20 }}>
      {children}
    </Card>
  );
}
