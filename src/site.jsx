import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import logo from '../assets/logo.png';
import haciendaPhoto from '../assets/Pizzplass Hacienda.png';
import prosciuttoPhoto from '../assets/Pizza Prosciutto.png';
import fourCheesePhoto from '../assets/Pizza 4 Quesos.png';
import pepperoniPhoto from '../assets/Pizza Pepperoni.png';
import carbonaraPhoto from '../assets/Pizza Carbonara.png';
import { articleBySlug, articles } from './articles';
import SmokeBackground from './SmokeBackground';
import BudgetForm from './BudgetForm';
import SocialIcon from './SocialIcon';

export const whatsapp = `https://wa.me/34675264967?text=${encodeURIComponent('¡Hola PizzPlass! Quiero información para un evento.')}`;
const instagram = 'https://www.instagram.com/pizzplass_pizzas/';
const googleMaps = 'https://maps.app.goo.gl/h2K9rTtQdC68M3NK6';
const reviewUrl = 'https://search.google.com/local/writereview?placeid=ChIJhwj6rkzJyKARsZ8s-ct87m0';
const foundersAssets = import.meta.glob('../assets/Nosotros/*.{jpeg,jpg,png,webp}', { eager: true, import: 'default' });
const teamAssets = import.meta.glob('../assets/Equipo/*.{jpeg,jpg,png,webp}', { eager: true, import: 'default' });
const eventAssets = import.meta.glob('../assets/Eventos/*.{jpeg,jpg,png,webp}', { eager: true, import: 'default' });
const photosFromFolder = (assets, label) => Object.entries(assets).sort(([first], [second]) => first.localeCompare(second, undefined, { numeric: true })).map(([, src], index) => [src, `${label} — foto ${index + 1}`]);
const eventTypes = [['💍 ⛪', 'Bodas y comuniones', '/eventos.html'], ['🎂', 'Cumpleaños', '/eventos.html'], ['🏋️', 'Post-Eventos Deportivos', '/eventos.html'], ['🎪 🎉', 'Ferias, Mercados y Festivales', '/eventos.html'], ['🏢', 'Eventos corporativos', '/eventos.html'], ['🥂 🍕 ✨', 'Catas privadas', '/contacto.html']];

function useSeo(title, description, path = '') {
  useEffect(() => {
    document.title = title;
    const setMeta = (attribute, name, content) => {
      let node = document.querySelector(`meta[${attribute}="${name}"]`);
      if (!node) { node = document.createElement('meta'); node.setAttribute(attribute, name); document.head.appendChild(node); }
      node.content = content;
    };
    const canonicalUrl = `https://pizzplass.es/${path}`;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonicalUrl);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = canonicalUrl;
  }, [title, description, path]);
}

function socialPlatform(href) {
  if (href.includes('wa.me')) return 'whatsapp';
  if (href.includes('instagram.com')) return 'instagram';
  if (href.includes('tiktok.com')) return 'tiktok';
  return '';
}

function Button({ href, children, variant = 'primary', external = false, className = '' }) {
  const platform = socialPlatform(href);
  return <a className={`button button--${variant}${platform === 'whatsapp' ? ' button--whatsapp' : ''} ${className}`} href={href} {...(external ? { target: '_blank', rel: 'noopener' } : {})}>{platform && <SocialIcon platform={platform} />}{children}</a>;
}

function PhotoCarousel({ photos, label, caption, className = '' }) {
  const [activePhoto, setActivePhoto] = useState(0);
  const dragStart = useRef(null);
  if (!photos.length) return null;
  const showPhoto = (offset) => setActivePhoto((current) => (current + offset + photos.length) % photos.length);
  const startDrag = (event) => {
    if (event.target.closest?.('button')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragStart.current = { id: event.pointerId, x: event.clientX };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  };
  const finishDrag = (event) => {
    if (!dragStart.current || dragStart.current.id !== event.pointerId) return;
    const distance = event.clientX - dragStart.current.x;
    dragStart.current = null;
    if (Math.abs(distance) >= 45) showPhoto(distance < 0 ? 1 : -1);
  };
  return <div className={`photo-carousel ${className}`} aria-label={label} onPointerDown={startDrag} onPointerUp={finishDrag} onPointerCancel={() => { dragStart.current = null; }}><div className="photo-carousel__slides story__slides">{photos.map(([src, alt], index) => <figure className={`photo-carousel__slide story__slide ${index === activePhoto ? 'is-active' : ''}`} key={src} aria-hidden={index !== activePhoto}><img src={src} alt={alt} draggable="false" /></figure>)}</div>{caption && <span className="photo-carousel__caption story__caption">{caption}</span>}<div className="photo-carousel__controls story__controls"><button type="button" aria-label="Ver foto anterior" onClick={() => showPhoto(-1)}>←</button><div className="photo-carousel__dots story__dots" aria-label="Selector de fotos">{photos.map(([, alt], index) => <button type="button" className={index === activePhoto ? 'is-active' : ''} aria-label={`Ver foto ${index + 1}`} aria-pressed={index === activePhoto} onClick={() => setActivePhoto(index)} key={alt} />)}</div><button type="button" aria-label="Ver siguiente foto" onClick={() => showPhoto(1)}>→</button></div></div>;
}

function Header() {
  const [open, setOpen] = useState(false);
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const links = [['index.html', 'Inicio'], ['nosotros.html', 'Nosotros'], ['eventos.html', 'Eventos'], ['blog.html', 'Blog']];
  return <header className="header"><div className="shell header__inner">
    <a className="brand" href="/index.html" aria-label="PizzPlass, inicio"><img src={logo} alt="" /><span><strong>PizzPlass</strong><small>Pizza experiences</small></span></a>
    <button type="button" className={`menu-button ${open ? 'is-open' : ''}`} aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} onClick={() => setOpen(!open)}><span className="menu-button__label">Menú</span>{' '}<span className="menu-button__icon" aria-hidden="true">{open ? '×' : '🍕'}</span></button>
    <nav className={`nav ${open ? 'is-open' : ''}`} aria-label="Navegación principal">
      {links.map(([href, label]) => <a key={href} className={path === href || (path === '' && href === 'index.html') ? 'active' : ''} href={`/${href}`}>{label}</a>)}
      <Button href="/contacto.html">Pide presupuesto</Button>
    </nav>
  </div></header>;
}

function Footer() {
  return <><footer className="footer"><div className="shell footer__grid">
    <div><a className="brand brand--footer" href="/index.html"><img src={logo} alt="PizzPlass" /><span><strong>PizzPlass</strong><small>Pizza experiences</small></span></a><p>Pizza napolitana elaborada al momento para eventos en toda España.</p><div className="socials"><a href={instagram} target="_blank" rel="noopener" aria-label="Instagram"><SocialIcon platform="instagram" /></a><a href="https://www.tiktok.com/@pizzplass.pizzas" target="_blank" rel="noopener" aria-label="TikTok"><SocialIcon platform="tiktok" /></a><a className="socials__whatsapp" href={whatsapp} target="_blank" rel="noopener" aria-label="WhatsApp"><SocialIcon platform="whatsapp" /></a></div></div>
    <div><h3>Descubre</h3><a href="/nosotros.html">Quiénes somos</a><a href="/eventos.html">Eventos</a><a href="/blog.html">Historias del horno</a></div>
    <div><h3>Contacto</h3><a href={whatsapp} target="_blank" rel="noopener">675 26 49 67</a><a href="mailto:pizzplasspizzas@gmail.com">pizzplasspizzas@gmail.com</a><span>Sevilla · Servicio en toda España</span></div>
  </div><div className="shell footer__bottom">© {new Date().getFullYear()} PizzPlass · Hecho con fuego, harina e ilusión.</div></footer><a className="whatsapp" href={whatsapp} target="_blank" rel="noopener" aria-label="Abrir WhatsApp"><SocialIcon platform="whatsapp" /><b>WhatsApp</b></a></>;
}

function Layout({ children, immersive = false }) {
  return <div className={`site-frame ${immersive ? 'site-frame--immersive' : ''}`}>
    <SmokeBackground />
    <Header />
    <main>{children}</main>
    <Footer />
  </div>;
}
function Eyebrow({ children }) { return <span className="eyebrow">{children}</span>; }
function PageHero({ eyebrow, title, children }) { return <section className="page-hero"><div className="shell page-hero__content"><Eyebrow>{eyebrow}</Eyebrow><h1>{title}</h1>{children && <p>{children}</p>}</div></section>; }
function Cta({ title = '¿Ponemos fecha a tu evento?', text = 'Cuéntanos dónde, cuándo y cuántos seréis. Te respondemos sin compromiso.' }) { return <section className="section section--compact"><div className="shell cta"><div><Eyebrow>El siguiente paso</Eyebrow><h2>{title}</h2><p>{text}</p></div><div className="cta__actions"><Button href="/contacto.html" variant="light">Pide presupuesto</Button><Button href={whatsapp} variant="outline" external>WhatsApp</Button></div></div></section>; }

export function Home() {
  useSeo('PizzPlass — Pizza napolitana para eventos', 'Pizza napolitana elaborada al momento para bodas, comuniones, cumpleaños, ferias y eventos en toda España.');
  return <Layout immersive><div className="home-page"><section className="home-hero"><div className="shell home-hero__grid"><div className="home-hero__copy"><Eyebrow>Pizza napolitana · eventos en toda España</Eyebrow><h1>El horno llega.<br/><em>La fiesta empieza.</em></h1><p>Terminamos y horneamos cada pizza delante de tus invitados: masa lenta, ingredientes cuidados y ese punto de espectáculo que se recuerda.</p><div className="hero-actions"><Button href="/contacto.html">Solicita presupuesto <span>→</span></Button><Button href={whatsapp} variant="quiet" external>Hablemos por WhatsApp</Button></div><div className="trust-row"><span><b>48 h</b> de fermentación</span><span><b>450 °C</b> de horno</span><span><b>A medida</b> para cada evento</span></div></div><div className="hero-visual" aria-label="PizzPlass en una hacienda para eventos"><div className="hero-visual__halo"></div><div className="hero-visual__card"><img src={haciendaPhoto} alt="Rótulo de PizzPlass en el césped de una hacienda con mesas de celebración y piscina" fetchPriority="high" /></div><span className="hero-visual__note note--one">🔥 Al momento</span><span className="hero-visual__note note--two">📍 Desde Sevilla</span></div></div></section>
    <section className="section" id="eventos"><div className="shell"><div className="section-heading"><div><Eyebrow>Tu ocasión, nuestro horno</Eyebrow><h2>Hay muchas formas de celebrar.<br/>Todas mejoran con pizza.</h2></div><a className="arrow-link" href="/eventos.html">Ver todos los servicios →</a></div><div className="occasion-grid">{eventTypes.map(([icon, title, href]) => <a href={href} className="occasion" key={title}><span>{icon}</span><strong>{title}</strong><small>Descubrir →</small></a>)}</div><p className="occasion-callout">¿Quieres vivir la experiencia? Contacta con nosotros sin compromiso!</p></div></section>
    <section className="section section--ink"><div className="shell experience"><div><Eyebrow>Esto no es solo catering</Eyebrow><h2>El aroma, el fuego y la primera pizza saliendo del horno.</h2></div><div className="experience__copy"><p>Montamos un rincón napolitano dentro de tu evento. Tus invitados ven cómo nace cada pizza y la disfrutan recién hecha.</p><ul><li>Montaje y recogida incluidos</li><li>Carta adaptada a tu celebración</li><li>Servicio cercano de Leo y Juan Antonio</li></ul><Button href="/nosotros.html" variant="light">Conoce PizzPlass</Button></div></div></section>
    <Cta title="Tu próxima celebración puede oler a Nápoles" />
  </div></Layout>;
}

export function Events() {
  useSeo('Eventos — PizzPlass', 'Pizza napolitana al momento para bodas, comuniones, cumpleaños, deporte, ferias y empresas.', 'eventos.html');
  const eventPhotos = photosFromFolder(eventAssets, 'PizzPlass en eventos');
  const pizzas = [
    { name: 'Prosciutto', icon: '🐷', photo: prosciuttoPhoto },
    { name: '4 quesos', icon: '🧀', photo: fourCheesePhoto },
    { name: 'Pepperoni', icon: 'pepperoni', photo: pepperoniPhoto },
    { name: 'Carbonara', icon: '🥓🍄', photo: carbonaraPhoto },
    { name: 'Especial PizzPlass', icon: '❓🍕❓' },
  ];
  const [activePizza, setActivePizza] = useState(null);
  const [isClosingPizza, setIsClosingPizza] = useState(false);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);

  const closePizza = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActivePizza(null);
      return;
    }
    setIsClosingPizza(true);
  };

  useEffect(() => {
    if (!activePizza) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closePizza();
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus();
    };
  }, [activePizza]);

  useEffect(() => {
    if (!isClosingPizza) return undefined;
    const timer = window.setTimeout(() => {
      setActivePizza(null);
      setIsClosingPizza(false);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [isClosingPizza]);

  const openPizza = (pizza, event) => {
    triggerRef.current = event.currentTarget;
    setIsClosingPizza(false);
    setActivePizza(pizza);
  };
  return <Layout>
    <PageHero eyebrow="Servicios" title="Un formato diferente para eventos que quieren sorprender">Montamos, horneamos y servimos. Tú solo tienes que disfrutar.</PageHero>
    <section className="section section--soft"><div className="shell events-gallery"><div><Eyebrow>Así se vive PizzPlass</Eyebrow><h2>Pizza recién hecha, gente disfrutando</h2></div><PhotoCarousel photos={eventPhotos} label="Fotos de eventos PizzPlass" caption="PizzPlass en acción" className="events-carousel" /></div></section>
    <section className="section"><div className="shell"><div className="section-heading"><div><Eyebrow>Tu ocasión, nuestro horno</Eyebrow><h2>Celebraciones a tu manera</h2></div></div><div className="occasion-grid">{eventTypes.map(([icon, title]) => <a href="/contacto.html" className="occasion" key={title}><span>{icon}</span><strong>{title}</strong><small>Consultar disponibilidad →</small></a>)}</div><p className="occasion-callout">¿Quieres vivir la experiencia? Contacta con nosotros sin compromiso!</p></div></section>
    <section className="section"><div className="shell menu-block"><div><Eyebrow>Una muestra de la carta</Eyebrow><h2>Clásicos y sorpresas</h2><p>La Especial PizzPlass es una sorpresa diferente en cada evento.</p></div><div><div className="pizza-list">{pizzas.map((pizza) => {
      const content = <><span className={`pizza-icon${pizza.name === 'Pepperoni' ? ' pizza-icon--pepperoni' : ''}${!pizza.photo ? ' pizza-icon--special' : ''}`} aria-hidden="true">{pizza.icon}</span><span className="pizza-card__text"><h3>{pizza.name}</h3>{pizza.photo && <small>Ver foto</small>}</span></>;
      return pizza.photo
        ? <button type="button" className="pizza-card pizza-card--interactive" key={pizza.name} onClick={(event) => openPizza(pizza, event)} aria-label={`Ver foto de la pizza ${pizza.name}`}>{content}</button>
        : <div className="pizza-card" key={pizza.name}>{content}</div>;
    })}</div><div className="pizza-notes"><p>Posibilidad de pizzas sin gluten, sin lactosa y para otras intolerancias. Consúltanos con antelación.</p><p>También puedes sugerirnos pizzas personalizadas a tu gusto.</p></div></div></div></section>
    <section className="section section--soft"><div className="shell"><div className="section-heading"><div><Eyebrow>Cómo trabajamos</Eyebrow><h2>Todo preparado para que tú no te ocupes de nada</h2></div></div><div className="process process--four">{[['1','Nos cuentas tu idea','Hablamos sobre la fecha, el lugar, los invitados y el ambiente que quieres crear.'],['2','Preparamos cada detalle','Organizamos el montaje y llegamos con tiempo para tener el puesto listo antes de empezar.'],['3','Horneamos en directo','Terminamos cada pizza ante tus invitados y la servimos recién salida del horno.'],['4','Recogemos al terminar','Desmontamos nuestro espacio y dejamos la zona preparada para que tú sigas disfrutando.']].map(([n,t,p])=><div className="process__item" key={n}><span>{n}</span><h3>{t}</h3><p>{p}</p></div>)}</div></div></section>
    <Cta />
    {activePizza && createPortal(<div className={`pizza-modal${isClosingPizza ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={`Foto de la pizza ${activePizza.name}`} onClick={(event) => { if (event.target === event.currentTarget) closePizza(); }}><div className="pizza-modal__panel"><button className="pizza-modal__close" type="button" ref={closeButtonRef} onClick={closePizza} aria-label="Cerrar foto">×</button><img src={activePizza.photo} alt={`Pizza ${activePizza.name}`} /></div></div>, document.body)}
  </Layout>;
}

function InstagramFeed() {
  const [posts, setPosts] = useState([]);
  useEffect(() => { fetch('/data/instagram-feed.json').then(r => r.ok ? r.json() : Promise.reject()).then(x => setPosts((x.data || []).slice(0, 6))).catch(() => {}); }, []);
  return <div className="insta-grid">{posts.length ? posts.map(post => <a key={post.id} href={post.permalink} target="_blank" rel="noopener"><img src={post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url} alt={(post.caption || 'Publicación de PizzPlass').slice(0, 100)} loading="lazy" /></a>) : ['🍕','🔥','🎉','🤌','🌾','❤️'].map((x,i)=><a href={instagram} target="_blank" rel="noopener" className="insta-placeholder" key={i}>{x}</a>)}</div>;
}
function GoogleReviews() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/data/google-reviews.json').then(r => r.ok ? r.json() : Promise.reject()).then(setData).catch(() => {}); }, []);
  const reviews = data?.reviews?.filter(r => r.text?.text).slice(0, 3) || [];
  return <div className="reviews"><div className="reviews__summary"><strong>{data?.rating ? data.rating.toFixed(1).replace('.', ',') : '5,0'}</strong><div><span>★★★★★</span><small>{data?.userRatingCount ? `${data.userRatingCount} reseñas` : 'Reseñas en Google'}</small></div><a href={googleMaps} target="_blank" rel="noopener">Ver ficha ↗</a></div>{reviews.length ? reviews.map((r,i)=><blockquote key={i}><span>★★★★★</span><p>“{r.text.text}”</p><cite>{r.authorAttribution?.displayName || 'Cliente de Google'}</cite></blockquote>) : <div className="reviews__empty"><p>Las reseñas aparecerán aquí al conectar Google Places.</p><a href={googleMaps} target="_blank" rel="noopener">Mientras tanto, visita nuestra ficha →</a></div>}</div>;
}

export function About() {
  useSeo('Nosotros — PizzPlass', 'Conoce a Leo y Juan Antonio: pizza napolitana horneada en directo con ingredientes traídos de Italia, hornos de gas y presupuestos a medida.', 'nosotros.html');
  const founderPhotos = photosFromFolder(foundersAssets, 'Leo y Juan Antonio');
  const currentTeamPhotos = photosFromFolder(teamAssets, 'Equipo PizzPlass');
  return <Layout><PageHero eyebrow="Detrás de PizzPlass" title="Pizza en directo, hecha para tu evento.">Leo y Juan Antonio montan un puesto donde tus invitados ven cómo hace y hornea cada pizza.</PageHero><section className="section"><div className="shell story"><PhotoCarousel photos={founderPhotos} label="Fotos de Leo y Juan Antonio" caption="Leo & Juan Antonio" className="story__visual story__carousel" /><div><Eyebrow>Nuestra forma de trabajar</Eyebrow><h2>El horno encendido, la pizza ante tus ojos</h2><p>Preparamos la masa en nuestro obrador con un mínimo de 48 horas de fermentación. En cada evento añadimos ingredientes naturales traídos de Italia y hacemos el horneado final al momento en hornos de gas, no eléctricos.</p><p>También cuidamos lo que ocurre antes del evento: respondemos con rapidez, te atendemos de cerca y preparamos un presupuesto adaptado a lo que necesitas.</p><div className="values">{[['🔥','Horno de gas'],['🇮🇹','Ingredientes de Italia'],['🤝','Respuesta rápida y cercana'],['📋','Presupuesto a medida']].map(([i,t])=><span key={t}>{i} {t}</span>)}</div></div></div></section><section className="section section--soft team-section"><div className="shell social-panel"><div><Eyebrow>Personas que hacen PizzPlass</Eyebrow><h2>Nuestro equipo</h2><p>Hoy contamos con dos puestos de trabajo y seguimos creciendo para llevar PizzPlass a más celebraciones.</p></div><PhotoCarousel photos={currentTeamPhotos} label="Fotos del equipo PizzPlass" caption="Equipo PizzPlass" className="team-carousel" /></div></section><section className="section section--soft"><div className="shell social-panel"><div><Eyebrow>El día a día</Eyebrow><h2>Síguenos en Instagram</h2><p>Montajes, eventos y pizzas recién salidas del horno. Cada imagen abre su publicación original.</p><Button href={instagram} external>Ver @pizzplass_pizzas</Button></div><InstagramFeed /></div></section><section className="section"><div className="shell social-panel social-panel--reviews"><div><Eyebrow>Opiniones reales</Eyebrow><h2>Lo que cuentan en Google</h2><p>Consulta la ficha de PizzPlass o deja tu experiencia para ayudar a otras personas a encontrarnos.</p><div className="hero-actions"><Button href={googleMaps} external>Ver en Google</Button><Button href={reviewUrl} variant="quiet" external>Dejar una reseña</Button></div></div><GoogleReviews /></div></section><Cta title="Nos encantaría cocinar en tu evento" /></Layout>;
}

export function Blog() {
  useSeo('Blog — Historias del horno | PizzPlass', 'Consejos, tradición y experiencias alrededor de la pizza napolitana.', 'blog.html');
  return <Layout><PageHero eyebrow="Historias del horno" title="Pizza, fuego y celebraciones">Ideas útiles y un poco de cultura napolitana, sin relleno.</PageHero><section className="section"><div className="shell articles-grid">{articles.map(a=><a href={`/blog/${a.slug}.html`} className="article-card" key={a.slug}><div className={`article-card__cover tone--${a.tone}`}><span>{a.icon}</span><small>{a.minutes} min</small></div><div><span className="tag">{a.tag}</span><h2>{a.title}</h2><p>{a.excerpt}</p><b>Leer artículo →</b></div></a>)}</div></section><Cta /></Layout>;
}

export function Article({ slug }) {
  const article = articleBySlug[slug];
  useSeo(article ? `${article.title} | PizzPlass` : 'Página no encontrada | PizzPlass', article?.excerpt || 'La página solicitada no existe.', article ? `blog/${article.slug}.html` : '');
  if (!article) return <NotFound />;
  return <Layout><article className="section"><div className="shell article-page"><a className="arrow-link" href="/blog.html">← Volver al blog</a><div className={`article-page__cover tone--${article.tone}`}><span>{article.icon}</span></div><span className="tag">{article.tag}</span><p className="article-page__meta">Por PizzPlass · {article.minutes} min de lectura</p><h1>{article.title}</h1><div className="article-content" dangerouslySetInnerHTML={{ __html: article.body }} /><div className="article-page__cta"><h2>¿Lo llevamos a tu evento?</h2><p>Cuéntanos tu idea y te preparamos una propuesta.</p><Button href="/contacto.html" variant="light">Pide presupuesto</Button></div></div></article></Layout>;
}

export function Contact() {
  useSeo('Contacto — Pide presupuesto | PizzPlass', 'Solicita presupuesto para llevar PizzPlass a tu evento.', 'contacto.html');
  return <Layout><PageHero eyebrow="Hablemos de tu evento" title="Cuéntanos el plan. Nosotros ponemos el horno.">Normalmente respondemos en menos de 24 horas.</PageHero><section className="section"><div className="shell contact-layout"><BudgetForm eventTypes={eventTypes.map(([, title]) => title)} /><div className="tip contact-tip"><span>💡</span><p><strong>Para afinar:</strong> fecha, lugar e invitados son los tres datos que más nos ayudan.</p></div><aside><Eyebrow>Contacto directo</Eyebrow><h2>Estamos a un mensaje</h2><p>Si aún no tienes todos los detalles, no pasa nada. Cuéntanos lo que sabes y lo vemos contigo.</p><div className="contact-options"><a className="contact-option--whatsapp" href={whatsapp} target="_blank" rel="noopener"><span><SocialIcon platform="whatsapp" /></span><div><small>WhatsApp</small><strong>675 26 49 67</strong></div></a><a href="mailto:pizzplasspizzas@gmail.com"><span>✉</span><div><small>Email</small><strong>pizzplasspizzas@gmail.com</strong></div></a><a href={instagram} target="_blank" rel="noopener"><span><SocialIcon platform="instagram" /></span><div><small>Instagram</small><strong>@pizzplass_pizzas</strong></div></a></div></aside></div></section></Layout>;
}

function NotFound() { useSeo('Página no encontrada | PizzPlass', 'La página solicitada no existe.'); return <Layout><PageHero eyebrow="404" title="Esta pizza no estaba en la carta">Vuelve al inicio y seguimos desde allí.</PageHero><section className="section center"><Button href="/index.html">Volver al inicio</Button></section></Layout>; }

export function Router() {
  const path = window.location.pathname.replace(/\\/g,'/');
  const filename = path.split('/').pop() || 'index.html';
  if (path.includes('/blog/')) return <Article slug={filename.replace('.html','')} />;
  if (filename === 'eventos.html') return <Events />;
  if (filename === 'nosotros.html') return <About />;
  if (filename === 'blog.html') return <Blog />;
  if (filename === 'contacto.html') return <Contact />;
  if (filename === 'index.html' || filename === '') return <Home />;
  return <NotFound />;
}
