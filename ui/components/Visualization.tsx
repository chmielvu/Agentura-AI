import React from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, Tooltip, Legend, Cell } from 'recharts';
import { VizSpec } from '../../types';

const COLORS = ['#E53935', '#5E35B1', '#1E88E5', '#43A047', '#FDD835', '#FB8C00'];

export const Visualization: React.FC<{ spec: VizSpec }> = ({ spec }) => {
  if (!spec || !spec.data || spec.data.length === 0) {
    return <div className="text-xs text-accent my-2">[Visualization Spec Invalid or Empty]</div>;
  }

  const renderChart = () => {
    switch (spec.type) {
      case 'bar':
        return (
          <BarChart data={spec.data}>
            <XAxis dataKey={spec.categoryKey} stroke="#E0E0E0" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#E0E0E0" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
                contentStyle={{ 
                    backgroundColor: '#333333', 
                    border: '1px solid #424242',
                    color: '#E0E0E0',
                    fontFamily: 'Roboto Mono, monospace',
                    fontSize: '12px',
                }}
            />
            <Bar dataKey={spec.dataKey} fill="#E53935" radius={[2, 2, 0, 0]} />
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={spec.data}>
             <XAxis dataKey={spec.categoryKey} stroke="#E0E0E0" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#E0E0E0" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
                contentStyle={{ 
                    backgroundColor: '#333333', 
                    border: '1px solid #424242',
                    color: '#E0E0E0',
                    fontFamily: 'Roboto Mono, monospace',
                    fontSize: '12px',
                }}
            />
            <Line type="monotone" dataKey={spec.dataKey} stroke="#E53935" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={spec.data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey={spec.dataKey}
              nameKey={spec.categoryKey}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                const RADIAN = Math.PI / 180;
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={12}>
                    {`${(percent * 100).toFixed(0)}%`}
                  </text>
                );
              }}
            >
              {spec.data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
             <Tooltip
                contentStyle={{ 
                    backgroundColor: '#333333', 
                    border: '1px solid #424242',
                    color: '#E0E0E0',
                    fontFamily: 'Roboto Mono, monospace',
                    fontSize: '12px',
                }}
            />
            <Legend />
          </PieChart>
        );
      default:
        return null;
    }
  };

  return (
    <div className="my-4 p-2 bg-card/50 rounded-sm border border-border/50">
      <h4 className="text-xs font-semibold text-foreground/80 mb-2 px-2">Data Visualization:</h4>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};