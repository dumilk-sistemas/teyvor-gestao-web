import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { logout } from '@/services/api';
import { theme, useThemeColors } from '@/constants/theme';
import { TEYVOR_DEFAULT_BRANDING, useBranding } from '@/contexts/BrandingContext';
import { useUser } from '@/contexts/UserContext';

const ROUTE_PERMISSIONS: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/sales': 'sales',
  '/products': 'products',
  '/stock': 'stock',
  '/customers': 'customers',
  '/suppliers': 'suppliers',
  '/purchases': 'purchases',
  '/finance': 'finance',
  '/cash': 'cash',
  '/statistics': 'reports',
  '/reports': 'reports',
};

const desktopNav = [
  ['/dashboard', 'Dashboard', 'home'],
  ['/sales', 'Vendas', 'shopping-cart'],
  ['/products', 'Produtos', 'package'],
  ['/stock', 'Estoque', 'archive'],
  ['/customers', 'Clientes', 'users'],
  ['/suppliers', 'Fornecedores', 'truck'],
  ['/purchases', 'Compras', 'shopping-bag'],
  ['/finance', 'Financeiro', 'dollar-sign'],
  ['/cash', 'Caixa', 'credit-card'],
  ['/statistics', 'Estatísticas', 'bar-chart-2'],
  ['/reports', 'Relatórios', 'file-text'],
] as const;

const moreNav = [
  ['/stock', 'Estoque'],
  ['/suppliers', 'Fornecedores'],
  ['/purchases', 'Compras / Recebimentos'],
  ['/finance', 'Financeiro'],
  ['/cash', 'Caixa'],
  ['/statistics', 'Estatísticas'],
  ['/reports', 'Relatórios'],
] as const;

const mobileMainNav = [
  ['/dashboard', 'home', 'Início'],
  ['/sales', 'shopping-cart', 'Vendas'],
  ['/products', 'package', 'Produtos'],
  ['/customers', 'users', 'Clientes'],
] as const;

const usersNavItem = ['/users', 'Usuários', 'user'] as const;

type Props = {
  title: string;
  subtitle: string;
  syncText?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  customersWrite?: boolean;
  // Ações da própria tela (ex.: "+ Novo usuário"), mostradas ao lado
  // do título — mesmo padrão de cabeçalho já usado no PDV. Opcional:
  // telas que não passam isso continuam com o layout de sempre.
  headerActions?: ReactNode;
  // Mostra o aviso "Sincronização protegida" (pequeno) no rodapé.
  // Só faz sentido em telas que realmente mandam uma ação pro caixa
  // (Compras, Clientes, Caixa, Financeiro) — não em telas só de
  // consulta. Só tem efeito no layout novo (com headerActions).
  syncNote?: boolean;
};

export function AdminShell({
  title,
  subtitle,
  syncText,
  children,
  refreshing = false,
  onRefresh,
  headerActions,
  syncNote = false,
}: Props) {
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const mobile = width < 760;
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { setBranding } = useBranding();
  const { hasPermission, isAdmin, setUser } = useUser();

  const [moreOpen, setMoreOpen] = useState(false);

  const visibleDesktopNav = useMemo(() => {
    const items = desktopNav.filter(([href]) => hasPermission(ROUTE_PERMISSIONS[href] || href));
    return isAdmin ? [...items, usersNavItem] : items;
  }, [hasPermission, isAdmin]);

  const visibleMoreNav = useMemo(() => {
    const items = moreNav.filter(([href]) => hasPermission(ROUTE_PERMISSIONS[href] || href));
    return isAdmin ? [...items, usersNavItem] : items;
  }, [hasPermission, isAdmin]);

  const visibleMobileMainNav = useMemo(
    () => mobileMainNav.filter(([href]) => hasPermission(ROUTE_PERMISSIONS[href] || href)),
    [hasPermission]
  );

  async function exit() {
    await logout();
    setBranding(TEYVOR_DEFAULT_BRANDING);
    setUser(null);
    router.replace('/login');
  }

  function navigate(href: string) {
    setMoreOpen(false);
    router.replace(href as never);
  }

  function goBack() {
    if (['/payables', '/receivables', '/cashflow'].includes(pathname)) {
      router.replace('/finance');
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/dashboard');
  }

  function routeIsActive(href: string) {
    if (pathname === href) return true;
    return href === '/finance' && ['/payables', '/receivables', '/cashflow'].includes(pathname);
  }

  const moreActive = visibleMoreNav.some(([href]) => routeIsActive(href));
  const backButton = pathname !== '/dashboard' ? (
    <Pressable style={[styles.backButton, mobile && styles.mobileBackButton]} onPress={goBack}>
      <Feather name="arrow-left" size={15} color={mobile ? '#FFFFFF' : c.text} />
      <Text style={[styles.backButtonText, mobile && styles.mobileBackButtonText]}>Voltar</Text>
    </Pressable>
  ) : null;

  const defaultRefreshButton = onRefresh ? (
    <Pressable
      style={styles.refresh}
      disabled={refreshing}
      onPress={onRefresh}
    >
      <Text style={styles.refreshText}>
        {refreshing
          ? 'Atualizando...'
          : 'Atualizar dados'}
      </Text>
    </Pressable>
  ) : null;

  if (!mobile) {
    // Layout novo (cabeçalho no padrão do PDV: título/subtítulo à
    // esquerda, ações da tela à direita, mesma linha) — só ativa
    // quando a própria tela passa `headerActions`. As demais telas
    // continuam com o layout antigo, sem nenhuma mudança visual.
    if (headerActions !== undefined || !mobile) {
      return (
        <View style={[styles.sidebarShell, { height }]}>
          <View style={styles.sidebar}>
            <View style={styles.sidebarBrand}>
              <Text style={styles.sidebarBrandName}>{c.brandName}</Text>
              <Text style={styles.sidebarBrandSub}>GESTÃO 360</Text>
            </View>

            <ScrollView
              style={styles.sidebarNavScroll}
              contentContainerStyle={styles.sidebarNav}
              showsVerticalScrollIndicator={false}
            >
              {visibleDesktopNav.map(([href, label, icon]) => {
                const active = routeIsActive(href);

                return (
                  <Pressable
                    key={href}
                    style={[
                      styles.sidebarNavItem,
                      active && styles.sidebarNavItemActive,
                    ]}
                    onPress={() => navigate(href)}
                  >
                    <Feather
                      name={icon}
                      size={16}
                      color={active ? c.gold : '#9AA4AE'}
                      style={styles.sidebarNavIcon}
                    />

                    <Text
                      style={[
                        styles.sidebarNavText,
                        active && styles.sidebarNavTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sidebarBottom}>
              <Pressable
                style={styles.sidebarLogout}
                onPress={exit}
              >
                <Text style={styles.sidebarLogoutText}>
                  Sair
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.mainColumn}>
            <View style={styles.pageHeadRow}>
              <View style={styles.titleArea}>
                {backButton}
                <Text style={styles.desktopTitle}>{title}</Text>

                <Text style={styles.subtitle}>
                  {subtitle}
                </Text>
              </View>

              <View style={styles.pageHeadActions}>
                {headerActions}
                {defaultRefreshButton}
              </View>
            </View>
            <ScrollView
              style={styles.mainArea}
              contentContainerStyle={styles.mainAreaContent}
              showsVerticalScrollIndicator
            >
              {!!syncText && (
                <View style={styles.sync}>
                  <View style={styles.dot} />

                  <Text style={styles.syncText}>
                    {syncText}
                  </Text>
                </View>
              )}

              {children}
            </ScrollView>
            <View style={styles.fixedFooter}>
              <Text style={styles.controlSmall}>
                {syncNote
                  ? '🔒 Sincronização protegida — alterações identificadas e sem repetição.'
                  : `${c.brandName} Gestão 360 • Ambiente administrativo`}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.desktopContent}
      >
        <View style={styles.brandRow}>
          <View style={styles.titleArea}>
            {backButton}
            <Text style={styles.eyebrow}>
              {c.brandName} GESTÃO 360
            </Text>

            <Text style={styles.desktopTitle}>{title}</Text>

            <Text style={styles.subtitle}>
              {subtitle}
            </Text>
          </View>

          <Pressable
            style={styles.logout}
            onPress={exit}
          >
            <Text style={styles.logoutText}>
              Sair
            </Text>
          </Pressable>
        </View>

        <View style={styles.navbar}>
          {visibleDesktopNav.map(([href, label]) => {
            const active = routeIsActive(href);

            return (
              <Pressable
                key={href}
                style={[
                  styles.navButton,
                  active && styles.navButtonActive,
                ]}
                onPress={() => navigate(href)}
              >
                <Text
                  style={[
                    styles.navText,
                    active && styles.navTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!!syncText && (
          <View style={styles.sync}>
            <View style={styles.dot} />

            <Text style={styles.syncText}>
              {syncText}
            </Text>
          </View>
        )}

        {defaultRefreshButton}

        {children}

        <View style={styles.control}>
          <Text style={styles.controlTitle}>
            Sincronização protegida
          </Text>

          <Text style={styles.controlText}>
            As alterações são enviadas ao caixa de forma protegida,
            identificada e sem repetição.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.mobileRoot}>
      <View style={styles.mobileHeader}>
        {backButton}
        <View style={styles.mobileHeaderText}>
          <Text style={styles.mobileEyebrow}>
            {c.brandName} GESTÃO 360
          </Text>

          <Text style={styles.mobileTitle}>
            {title}
          </Text>

          <Text
            numberOfLines={1}
            style={styles.mobileSubtitle}
          >
            {subtitle}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={styles.notificationButton}
            onPress={() => {
              /*
                A Central de Notificações será ligada
                aqui na próxima etapa.
              */
            }}
          >
            <Text style={styles.notificationIcon}>
              ♢
            </Text>

            <View style={styles.notificationBadge} />
          </Pressable>
        </View>
      </View>

      {!!syncText && (
        <View style={styles.mobileSync}>
          <View style={styles.dot} />

          <Text
            numberOfLines={1}
            style={styles.mobileSyncText}
          >
            {syncText}
          </Text>

          {onRefresh && (
            <Pressable
              disabled={refreshing}
              onPress={onRefresh}
            >
              <Text style={styles.mobileRefreshText}>
                {refreshing ? '...' : 'Atualizar'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <ScrollView
        style={styles.mobileScroll}
        contentContainerStyle={styles.mobileContent}
        showsVerticalScrollIndicator={false}
      >
        {children}

        <View style={styles.mobileBottomSpace} />
      </ScrollView>

      {moreOpen && (
        <View style={styles.morePanel}>
          <View style={styles.moreHeader}>
            <View>
              <Text style={styles.moreTitle}>
                Mais
              </Text>

              <Text style={styles.moreSubtitle}>
                Administração completa
              </Text>
            </View>

            <Pressable
              style={styles.moreClose}
              onPress={() => setMoreOpen(false)}
            >
              <Text style={styles.moreCloseText}>
                ×
              </Text>
            </Pressable>
          </View>

          {visibleMoreNav.map(([href, label]) => {
            const active = routeIsActive(href);

            return (
              <Pressable
                key={href}
                style={[
                  styles.moreItem,
                  active && styles.moreItemActive,
                ]}
                onPress={() => navigate(href)}
              >
                <Text
                  style={[
                    styles.moreItemText,
                    active && styles.moreItemTextActive,
                  ]}
                >
                  {label}
                </Text>

                <Text
                  style={[
                    styles.moreArrow,
                    active && styles.moreItemTextActive,
                  ]}
                >
                  ›
                </Text>
              </Pressable>
            );
          })}

          <View style={styles.moreDivider} />

          <Pressable
            style={styles.moreItem}
            onPress={exit}
          >
            <Text style={styles.logoutMobileText}>
              Sair do TEYVOR Gestão 360
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.bottomNav}>
        {visibleMobileMainNav.map(([href, icon, label]) => {
          const active = routeIsActive(href);

          return (
            <Pressable
              key={href}
              style={styles.bottomItem}
              onPress={() => navigate(href)}
            >
              <Feather
                name={icon}
                size={21}
                color={active ? c.gold : '#767676'}
              />

              <Text
                style={[
                  styles.bottomLabel,
                  active && styles.bottomLabelActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          style={styles.bottomItem}
          onPress={() => setMoreOpen(value => !value)}
        >
          <Feather
            name="more-horizontal"
            size={21}
            color={moreOpen || moreActive ? c.gold : '#767676'}
          />

          <Text
            style={[
              styles.bottomLabel,
              (moreOpen || moreActive) &&
                styles.bottomLabelActive,
            ]}
          >
            Mais
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.bg,
  },

  desktopContent: {
    padding: 22,
    paddingTop: 34,
    paddingBottom: 52,
    gap: 16,
    maxWidth: 1180,
    width: '100%',
    alignSelf: 'center',
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },

  // Layout de barra lateral fixa (mesmo padrão do PDV): menu empilhado
  // à esquerda, conteúdo rolável à direita.
  sidebarShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: c.bg,
    overflow: 'hidden',
  },

  sidebar: {
    width: 220,
    height: '100%',
    position: 'relative',
    backgroundColor: '#0D1117',
    paddingVertical: 18,
    paddingHorizontal: 12,
    paddingBottom: 76,
  },

  sidebarBrand: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },

  sidebarBrandName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Sora_800ExtraBold',
    letterSpacing: 1,
  },

  sidebarBrandSub: {
    color: c.gold,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginTop: 2,
  },

  sidebarNavScroll: {
    flex: 1,
    minHeight: 0,
  },

  sidebarNav: {
    gap: 3,
  },

  sidebarNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 9,
  },

  sidebarNavItemActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: c.gold,
  },

  sidebarNavIcon: {
    width: 18,
  },

  sidebarNavText: {
    color: '#E3E3E3',
    fontSize: 13,
    fontWeight: '600',
  },

  sidebarNavTextActive: {
    color: c.gold,
    fontWeight: '800',
  },

  sidebarBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  sidebarLogout: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },

  sidebarLogoutText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  mainArea: {
    flex: 1,
    minHeight: 0,
  },

  mainColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },

  mainAreaContent: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 52,
    gap: 22,
    maxWidth: 1180,
    width: '100%',
  },

  pageHeadRow: {
    backgroundColor: c.bg,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    flexWrap: 'wrap',
    paddingHorizontal: 28,
    paddingVertical: 18,
    zIndex: 10,
  },

  fixedFooter: {
    backgroundColor: c.bg,
    borderTopColor: c.border,
    borderTopWidth: 1,
    paddingHorizontal: 28,
    paddingVertical: 8,
  },

  pageHeadActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },

  titleArea: {
    flex: 1,
  },

  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: c.surface,
    borderColor: c.border,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  backButtonText: {
    color: c.text,
    fontSize: 12,
    fontWeight: '800',
  },

  mobileBackButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 0,
    marginRight: 10,
    paddingHorizontal: 8,
  },

  mobileBackButtonText: {
    color: '#FFFFFF',
  },

  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    color: c.gold,
    fontWeight: '900',
  },

  desktopTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Sora_800ExtraBold',
    color: c.text,
    marginTop: 4,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: c.muted,
    marginTop: 4,
  },

  logout: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: c.surface,
  },

  logoutText: {
    fontSize: 14,
    fontWeight: '800',
    color: c.text,
  },

  navbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    padding: 7,
  },

  navButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    justifyContent: 'center',
  },

  navButtonActive: {
    backgroundColor: c.black,
  },

  navText: {
    fontSize: 14,
    fontWeight: '800',
    color: c.text,
  },

  navTextActive: {
    color: '#FFFFFF',
  },

  sync: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.success,
  },

  syncText: {
    color: c.muted,
    fontSize: 13,
  },

  refresh: {
    alignSelf: 'flex-start',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  refreshText: {
    fontSize: 13,
    fontWeight: '800',
    color: c.text,
  },

  control: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.gold,
    borderRadius: theme.radius.md,
    padding: 16,
    backgroundColor: '#FCFAF5',
    marginTop: 2,
  },

  controlTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: c.text,
  },

  controlText: {
    fontSize: 13,
    lineHeight: 19,
    color: c.muted,
    marginTop: 5,
  },

  controlSmall: {
    fontSize: 11,
    lineHeight: 15,
    color: c.muted,
    marginTop: 4,
  },

  /* MOBILE */

  mobileRoot: {
    flex: 1,
    backgroundColor: c.bg,
  },

  mobileHeader: {
    backgroundColor: c.black,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  mobileHeaderText: {
    flex: 1,
    paddingRight: 12,
  },

  mobileEyebrow: {
    color: c.gold,
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 1.8,
  },

  mobileTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 28,
    fontFamily: 'Sora_800ExtraBold',
    marginTop: 3,
  },

  mobileSubtitle: {
    color: '#BFBFBF',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: '#343434',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  notificationIcon: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '700',
  },

  notificationBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: c.danger,
    borderWidth: 2,
    borderColor: c.black,
  },

  mobileSync: {
    minHeight: 36,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  mobileSyncText: {
    flex: 1,
    fontSize: 11,
    color: c.muted,
  },

  mobileRefreshText: {
    fontSize: 11,
    fontWeight: '900',
    color: c.gold,
  },

  mobileScroll: {
    flex: 1,
  },

  mobileContent: {
    padding: 14,
    gap: 14,
  },

  mobileBottomSpace: {
    height: 82,
  },

  bottomNav: {
    height: 70,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 3,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 4,
  },

  bottomItem: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomIcon: {
    fontSize: 21,
    lineHeight: 24,
    color: '#767676',
    fontWeight: '800',
  },

  bottomIconActive: {
    color: c.gold,
  },

  bottomLabel: {
    marginTop: 3,
    fontSize: 11.5,
    lineHeight: 13,
    fontWeight: '700',
    color: '#777777',
  },

  bottomLabelActive: {
    color: c.gold,
    fontWeight: '900',
  },

  morePanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 76,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 14,
    zIndex: 20,
  },

  moreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingTop: 2,
    paddingBottom: 9,
  },

  moreTitle: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    color: c.text,
  },

  moreSubtitle: {
    fontSize: 12,
    color: c.muted,
    marginTop: 2,
  },

  moreClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.bg,
  },

  moreCloseText: {
    fontSize: 26,
    color: c.text,
    lineHeight: 28,
  },

  moreItem: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  moreItemActive: {
    backgroundColor: '#F5F1E8',
  },

  moreItemText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    color: c.text,
  },

  moreItemTextActive: {
    color: c.gold,
    fontWeight: '900',
  },

  moreArrow: {
    fontSize: 23,
    color: c.muted,
  },

  moreDivider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 8,
  },

  logoutMobileText: {
    fontSize: 15,
    fontWeight: '800',
    color: c.danger,
  },
});
