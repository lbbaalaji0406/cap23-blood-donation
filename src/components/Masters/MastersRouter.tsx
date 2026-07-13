import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { BloodGroupList } from './BloodGroupList';
import { BloodGroupForm } from './BloodGroupForm';

export const MastersRouter = () => {
  const location = useLocation();
  const tabs = [
    { name: 'Blood Groups', path: '/masters/blood-group' },
    { name: 'Camps', path: '/masters/camp' },
    { name: 'Hospitals', path: '/masters/hospital' },
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      <h1 className="text-2xl font-bold text-slate-900">Master Data Management</h1>
      
      <div className="flex border-b border-slate-200">
        {tabs.map(tab => {
          const isActive = location.pathname.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${
                isActive 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.name}
            </Link>
          );
        })}
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Routes>
          <Route path="blood-group" element={<BloodGroupList />} />
          <Route path="blood-group/new" element={<BloodGroupForm />} />
          <Route path="blood-group/:id" element={<BloodGroupForm />} />
          
          <Route path="camp/*" element={<div className="p-6">Camp Master (Coming Soon)</div>} />
          <Route path="hospital/*" element={<div className="p-6">Hospital Master (Coming Soon)</div>} />

          <Route path="/" element={<Navigate to="blood-group" replace />} />
        </Routes>
      </div>
    </div>
  );
};
