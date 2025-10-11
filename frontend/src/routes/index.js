import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '../components/Login';
import Register from '../components/Register';
import UserDashboard from '../components/UserDashboard';
import AdminDashboard from '../components/AdminDashboard';
import RequestApiKey from '../components/RequestApiKey';
import ProtectedRoute from '../components/ProtectedRoute';
import Layout from '../components/Layout';
import Features from '../pages/Features';
import Home from '../pages/Home';

const AppRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/features" element={<Features />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<Layout />}>
                <Route 
                    path="/dashboard" 
                    element={
                        <ProtectedRoute>
                            <UserDashboard />
                        </ProtectedRoute>
                    } 
                />
                <Route 
                    path="/admin/*" 
                    element={
                        <ProtectedRoute roles={['admin']}>
                            <AdminDashboard />
                        </ProtectedRoute>
                    } 
                />
                <Route 
                    path="/request-api-key" 
                    element={
                        <ProtectedRoute>
                            <RequestApiKey />
                        </ProtectedRoute>
                    } 
                />
            </Route>
        </Routes>
    );
};

export default AppRoutes; 