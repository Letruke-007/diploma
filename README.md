[![CI (backend + frontend
tests)](https://github.com/Letruke-007/diploma/actions/workflows/ci.yml/badge.svg)](https://github.com/Letruke-007/diploma/actions/workflows/ci.yml)

# MyCloud --- Full-Stack File Storage Web Application

## Project Overview

**MyCloud** is a full-stack web application for file storage and
sharing, developed as a diploma / portfolio project for the *Full-Stack
Python Developer* program.

The application allows users to register and authenticate, upload and
manage files, organize them into folders, and share files via public
links.\
Administrators have extended permissions to manage users and access all
user storages.

The project is implemented as a single full-stack system with a
**Django-based backend** and a **React SPA frontend**.\
Deployment is containerized with Docker and fully reproducible on a VPS
environment using deployment scripts.

------------------------------------------------------------------------

## Project Architecture

The project is organized as a **monorepository** and consists of three
logical parts.

### Backend

-   Django + Django REST Framework
-   Session-based authentication
-   REST API for frontend interaction
-   Server-side file storage
-   PostgreSQL as the primary database

### Frontend

-   Single Page Application (SPA) built with React
-   React Router for client-side routing
-   Redux Toolkit for state management
-   Fully dynamic UI without page reloads

### Deployment / Infrastructure

-   Docker and Docker Compose
-   Backend, Nginx, and PostgreSQL run in containers
-   Frontend is built locally and served by Nginx as a static `dist`
-   Deployment is automated and reproducible using shell scripts

------------------------------------------------------------------------

## Technology Stack

### Backend

-   Python 3.12+
-   Django
-   Django REST Framework
-   PostgreSQL

### Frontend

-   React 18
-   React Router v6
-   Redux Toolkit
-   Vite
-   TypeScript

### Infrastructure

-   Docker
-   Docker Compose
-   Nginx
-   VPS (reg.ru)

### Testing

-   Django test runner (backend)
-   Jest / Testing Library / Vitest (frontend)

------------------------------------------------------------------------

## Repository Structure

    my-cloud/
    ├── backend/
    ├── frontend/
    ├── deploy/
    ├── deploy_frontend.sh
    ├── deploy_full_stack.sh
    └── README.md

------------------------------------------------------------------------

## Demo Access

For demonstration purposes, test accounts are available.

**Password for all accounts:**

    Qwerty123!

------------------------------------------------------------------------

## Live Demo

-   https://my-cloud-diploma.ru
