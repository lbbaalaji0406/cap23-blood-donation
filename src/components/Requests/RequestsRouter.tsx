import { Routes, Route } from 'react-router-dom';
import { RequestList } from './RequestList';
import { RequestForm } from './RequestForm';
import { RequestDetail } from './RequestDetail';

export const RequestsRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<RequestList />} />
      <Route path="/new" element={<RequestForm />} />
      <Route path="/:id" element={<RequestDetail />} />
      <Route path="/:id/edit" element={<RequestForm />} />
    </Routes>
  );
};
