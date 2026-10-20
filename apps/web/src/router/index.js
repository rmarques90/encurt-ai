import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '../composables/useSession.js'
import LandingView from '../views/LandingView.vue'
import AuthView from '../views/AuthView.vue'
import DashboardView from '../views/DashboardView.vue'
import AdminView from '../views/AdminView.vue'
import ErrorView from '../views/ErrorView.vue'
import ProfileView from '../views/ProfileView.vue'
export const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', component: LandingView }, { path: '/login', component: AuthView, props: { mode: 'login' } }, { path: '/register', component: AuthView, props: { mode: 'register' } },
  { path: '/dashboard', component: DashboardView, meta: { auth: true } }, { path: '/profile', component: ProfileView, meta: { auth: true } }, { path: '/admin', component: AdminView, meta: { auth: true, admin: true } },
  { path: '/403', component: ErrorView, props: { status: 403 } }, { path: '/404', component: ErrorView, props: { status: 404 } }, { path: '/500', component: ErrorView, props: { status: 500 } }, { path: '/:pathMatch(.*)*', component: ErrorView, props: { status: 404 } },
] })
router.beforeEach(async (to) => { if (!to.meta.auth) return true; const session = useSession(); if (!session.checked.value) await session.load(); if (!session.user.value) return '/login'; if (to.meta.admin && session.user.value.role !== 'admin') return '/403'; return true })
