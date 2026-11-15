<?php
/** Seitenvorlage „Wehrwerk-Website“: eigener Kopf mit Menü, Inhalt der Seite, Fuß mit Adresse und Links. */
defined('ABSPATH') || exit;
$s = myf_site(); $b = myf_brand(); $nav = myf_site_nav();
$cur = (int) get_queried_object_id();
$isCur = function ($u) use ($cur) { $q = []; parse_str((string) wp_parse_url($u, PHP_URL_QUERY), $q); $id = !empty($q['page_id']) ? (int) $q['page_id'] : url_to_postid($u); return $id && $id === $cur; };
$portal = function_exists('myf_member_page_url') ? myf_member_page_url() : '';
// Social Media: Instagram ist der Hauptkanal (Kopf und Fuß), Facebook nur im Fuß – dort steht dasselbe
$ig = $s['instagram']; $fb = $s['facebook'];
$icoIg = '<svg class="ws-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" class="ws-ico-f"/></svg>';
$icoFb = '<svg class="ws-ico" viewBox="0 0 24 24" aria-hidden="true"><path class="ws-ico-f" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.4V21z"/></svg>';
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="<?php echo esc_attr($b['color'] ?: '#e30613'); ?>">
<?php wp_head(); ?>
</head>
<body <?php body_class('ws-body'); ?>>
<?php wp_body_open(); ?>
<a class="ws-skip" href="#ws-main">Zum Inhalt</a>
<header class="ws-top" id="ws-top">
  <div class="ws-top-in">
    <a class="ws-logo" href="<?php echo esc_url(myf_site_link('start', home_url('/'))); ?>" aria-label="<?php echo esc_attr($b['org']); ?> – Startseite">
      <img class="ws-logo-l" src="<?php echo esc_url(myf_logo_url('light')); ?>" alt="<?php echo esc_attr($b['org']); ?>" width="316" height="50">
      <img class="ws-logo-d" src="<?php echo esc_url(myf_logo_url('dark')); ?>" alt="" aria-hidden="true" width="316" height="50">
    </a>
    <nav class="ws-nav" id="ws-nav" aria-label="Hauptmenü">
      <ul>
      <?php foreach ($nav as $n) {
          $on = $isCur($n['u']) || array_filter($n['c'], function ($c) use ($isCur) { return $isCur($c['u']); });
          echo '<li' . ($n['c'] ? ' class="has-sub"' : '') . '><a href="' . esc_url($n['u']) . '"' . ($on ? ' aria-current="page"' : '') . '>' . esc_html($n['t']) . '</a>';
          if ($n['c']) {
              echo '<button type="button" class="ws-subbtn" aria-expanded="false" aria-label="' . esc_attr($n['t']) . ' aufklappen"><span aria-hidden="true">›</span></button><ul>';
              foreach ($n['c'] as $c) echo '<li><a href="' . esc_url($c['u']) . '">' . esc_html($c['t']) . '</a></li>';
              echo '</ul>';
          }
          echo '</li>';
      } ?>
      </ul>
      <div class="ws-nav-cta">
        <a class="ws-btn is-red" href="<?php echo esc_url(myf_site_link('mitmachen', home_url('/feuerwehrmann-werden/'))); ?>">Mitmachen</a>
        <?php if ($portal) echo '<a class="ws-btn is-ghost-dark" href="' . esc_url($portal) . '">Intern</a>'; ?>
        <?php if ($ig) echo '<a class="ws-soc" href="' . esc_url($ig) . '" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram">' . $icoIg . '</a>'; ?>
      </div>
    </nav>
    <button type="button" class="ws-burger" aria-controls="ws-nav" aria-expanded="false"><span></span><b>Menü</b></button>
  </div>
</header>
<main id="ws-main" class="ws-main">
<?php while (have_posts()) { the_post(); the_content(); } ?>
</main>
<footer class="ws-foot">
  <div class="ws-wrap ws-foot-in">
    <div>
      <a class="ws-foot-logo" href="<?php echo esc_url(home_url('/')); ?>"><img src="<?php echo esc_url(myf_logo_url('dark')); ?>" alt="<?php echo esc_attr($b['org']); ?>" width="316" height="50" loading="lazy"></a>
      <p><?php echo esc_html($s['street']); ?><br><?php echo esc_html(trim($s['zip'] . ' ' . $s['city'])); ?></p>
      <?php if ($s['phone']) echo '<p><a href="tel:' . esc_attr(preg_replace('/[^\d+]/', '', $s['phone'])) . '">' . esc_html($s['phone']) . '</a></p>'; ?>
      <?php if ($s['mail']) echo '<p><a href="mailto:' . esc_attr(antispambot($s['mail'])) . '">' . esc_html(antispambot($s['mail'])) . '</a></p>'; ?>
    </div>
    <div>
      <p class="ws-foot-h">Feuerwehr</p>
      <ul><?php foreach (array_slice($nav, 0, 6) as $n) echo '<li><a href="' . esc_url($n['u']) . '">' . esc_html($n['t']) . '</a></li>'; ?></ul>
    </div>
    <div>
      <p class="ws-foot-h">Mitmachen</p>
      <ul>
        <li><a href="<?php echo esc_url(myf_site_link('mitmachen', home_url('/feuerwehrmann-werden/'))); ?>">Mitglied werden</a></li>
        <li><a href="<?php echo esc_url(myf_site_link('jugend', home_url('/jugendfeuerwehr/'))); ?>">Jugendfeuerwehr</a></li>
        <?php if ($portal) echo '<li><a href="' . esc_url($portal) . '">Intern (Mitglieder)</a></li>'; ?>
      </ul>
      <?php if ($ig || $fb) { echo '<p class="ws-foot-h" style="margin-top:18px">Folge uns</p><p class="ws-social">';
        if ($ig) echo '<a href="' . esc_url($ig) . '" rel="noopener" target="_blank">' . $icoIg . '<span>Instagram</span></a>';
        if ($fb) echo '<a href="' . esc_url($fb) . '" rel="noopener" target="_blank" class="is-2nd">' . $icoFb . '<span>Facebook</span></a>';
        echo '</p>'; } ?>
    </div>
    <div class="ws-foot-112"><b>112</b><span>Notruf bei Feuer, Unfall und wenn Menschen in Gefahr sind</span></div>
  </div>
  <div class="ws-wrap ws-foot-legal">
    <span>© <?php echo esc_html(current_time('Y') . ' ' . $b['org']); ?></span>
    <?php if ($s['imprint']) echo '<a href="' . esc_url($s['imprint']) . '">Impressum</a>'; ?>
    <?php if ($s['privacy']) echo '<a href="' . esc_url($s['privacy']) . '">Datenschutz</a>'; ?>
  </div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
