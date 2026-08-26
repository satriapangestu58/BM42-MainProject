var BM42 = {
  participant: null,
  evaluatorId: '',
  role: '',
  cameraWindow: null
};

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(m) {
    return {
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#039;'
    }[m];
  });
}

function setStatus(message, type) {
  var el = $('statusBox');
  el.textContent = message;
  el.className = 'status ' + (type || '');
}

function api(action, params, timeout) {
  params = params || {};
  timeout = timeout || 12000;

  return new Promise(function(resolve, reject) {
    var callback = 'bm42v15_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var script = document.createElement('script');
    var query = new URLSearchParams(params);
    query.set('action', action);
    query.set('callback', callback);

    var timer = setTimeout(function() {
      cleanup();
      reject(new Error('Server membutuhkan waktu terlalu lama. Coba lagi.'));
    }, timeout);

    window[callback] = function(data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function() {
      cleanup();
      reject(new Error('Backend tidak dapat diakses.'));
    };

    script.src = window.BM42_API_URL + '?' + query.toString();
    document.body.appendChild(script);

    function cleanup() {
      clearTimeout(timer);
      script.remove();
      try { delete window[callback]; } catch (e) {}
    }
  });
}

function enableModules(enabled) {
  var buttons = document.querySelectorAll('.module');
  buttons.forEach(function(b) {
    b.disabled = !enabled;
  });
}

function saveIdentity() {
  BM42.evaluatorId = $('evaluatorId').value.trim() || 'WEB';
  BM42.role = $('role').value;
  localStorage.setItem('BM42_V15_EVALUATOR', JSON.stringify({
    id: BM42.evaluatorId,
    role: BM42.role
  }));
  $('identityInfo').textContent = 'Penilai aktif: ' + BM42.evaluatorId + ' • ' + BM42.role;
  $('assignmentButton').classList.toggle(
    'hidden',
    ['OC','PERSONALIA','ADMIN'].indexOf(BM42.role) === -1
  );
  setStatus('Identitas penilai tersimpan.', 'ok');
}

function restoreIdentity() {
  var raw = localStorage.getItem('BM42_V15_EVALUATOR');
  if (!raw) {
    saveIdentity();
    return;
  }
  try {
    var x = JSON.parse(raw);
    $('evaluatorId').value = x.id || '';
    $('role').value = x.role || 'OC';
  } catch (e) {}
  saveIdentity();
}

function renderParticipant(p) {
  BM42.participant = p;
  $('participantCard').classList.remove('empty');
  $('participantCard').innerHTML =
    '<div class="participant-grid">' +
      '<div><small>ID</small><strong>' + esc(p.id) + '</strong></div>' +
      '<div><small>Nama</small><strong>' + esc(p.name) + '</strong></div>' +
      '<div><small>Nama Obat</small><strong>' + esc(p.drug) + '</strong></div>' +
      '<div><small>Kelompok</small><strong>' + esc(p.group) + '</strong></div>' +
    '</div>' +
    '<div class="inline">' +
      '<span class="pill">Peserta aktif</span>' +
      '<button id="participantAuditBtn" class="secondary">Lihat Kelengkapan</button>' +
    '</div>';

  $('selectedText').textContent = 'Peserta aktif: ' + p.id + ' • ' + p.name + ' • ' + p.drug;
  $('participantAuditBtn').onclick = function() { showParticipantAudit(); };
  enableModules(true);
  $('candidateList').innerHTML = '';
  setStatus('Peserta ' + p.id + ' dipilih.', 'ok');
}

function searchParticipant() {
  var q = $('searchInput').value.trim();
  if (!q) {
    setStatus('Masukkan identitas peserta terlebih dahulu.', 'error');
    return;
  }

  setStatus('Mencari peserta...');
  api('assessment', {
    op: 'searchParticipant',
    q: q
  }).then(function(data) {
    if (!data.ok) throw new Error(data.message || 'Pencarian gagal.');
    if (!data.candidates.length) {
      setStatus('Peserta tidak ditemukan.', 'error');
      return;
    }

    if (data.candidates.length === 1) {
      renderParticipant(data.candidates[0]);
      return;
    }

    $('candidateList').innerHTML = data.candidates.map(function(p) {
      return '<button class="candidate" data-id="' + esc(p.id) + '">' +
        '<b>' + esc(p.id) + ' • ' + esc(p.name) + '</b>' +
        '<span>' + esc(p.drug) + ' • ' + esc(p.group) + '</span>' +
      '</button>';
    }).join('');

    data.candidates.forEach(function(p) {
      var btn = $('candidateList').querySelector('[data-id="' + CSS.escape(p.id) + '"]');
      if (btn) btn.onclick = function() { renderParticipant(p); };
    });
  }).catch(function(err) {
    setStatus(err.message, 'error');
  });
}

function openForm(title, subtitle, html) {
  $('formCard').classList.remove('hidden');
  $('formTitle').textContent = title;
  $('formSubtitle').textContent = subtitle || '';
  $('formBody').innerHTML = html;
  $('formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeForm() {
  $('formCard').classList.add('hidden');
  $('formBody').innerHTML = '';
}

function requireParticipant() {
  if (!BM42.participant) {
    setStatus('Pilih peserta terlebih dahulu.', 'error');
    return false;
  }
  return true;
}

function genericFormSave(form, op) {
  if (!requireParticipant()) return;
  var data = Object.fromEntries(new FormData(form).entries());
  data.op = op;
  data.participantId = BM42.participant.id;
  data.evaluatorId = BM42.evaluatorId;
  data.role = BM42.role;

  setStatus('Menyimpan...');
  api('assessment', data).then(function(r) {
    if (!r.ok) throw new Error(r.message || 'Gagal menyimpan.');
    setStatus(r.message || 'Data berhasil disimpan.', 'ok');
    showParticipantAudit();
  }).catch(function(err) {
    setStatus(err.message, 'error');
  });
}

function showActivityForm() {
  openForm(
    'Keaktifan Materi',
    BM42.participant.id + ' • ' + BM42.participant.name,
    '<form id="activityForm" class="grid-2">' +
      '<div><label>Materi / aktivitas</label><select name="aktivitas">' +
        '<option>Materi I</option><option>Materi II</option><option>Materi III</option>' +
        '<option>Materi IV</option><option>Materi V</option><option>Materi VI</option>' +
      '</select></div>' +
      '<div><label>Jenis aktivitas</label><select name="jenis">' +
        '<option value="BERTANYA">Bertanya</option>' +
        '<option value="MENANGGAPI">Menanggapi</option>' +
        '<option value="MENJAWAB">Menjawab</option>' +
      '</select></div>' +
      '<div class="full"><label>Catatan</label><textarea name="catatan" placeholder="Opsional"></textarea></div>' +
      '<div class="full"><button type="button" id="activitySave" class="primary">Catat Aktivitas</button></div>' +
    '</form>'
  );
  $('activitySave').onclick = function() {
    genericFormSave($('activityForm'), 'saveActivity');
  };
}

function radioScale(name, label) {
  var values = [-3,-2,-1,0,1,2,3];
  return '<div class="poll-block">' +
    '<strong>' + esc(label) + '</strong>' +
    '<div class="poll-row">' +
      values.map(function(v) {
        return '<label class="poll">' +
          '<span>' + (v > 0 ? '+' + v : v) + '</span>' +
          '<input type="radio" name="' + esc(name) + '" value="' + v + '"' + (v === 0 ? ' checked' : '') + '>' +
        '</label>';
      }).join('') +
    '</div>' +
    '<small class="poll-help">-3 sangat di bawah • 0 sesuai • +3 sangat di atas</small>' +
  '</div>';
}

function showSikapForm() {
  openForm(
    'Sikap Peserta',
    BM42.participant.id + ' • penilaian -3 sampai +3',
    '<form id="sikapForm">' +
      '<div><label>Periode</label><select name="periode"><option>Keseluruhan BM</option><option>Hari 1</option><option>Hari 2</option></select></div>' +
      radioScale('Disiplin','Disiplin') +
      radioScale('Atribut','Atribut') +
      radioScale('Kesopanan','Kesopanan') +
      radioScale('Keaktifan','Keaktifan') +
      '<label>Catatan</label><textarea name="catatan"></textarea>' +
      '<button type="button" id="sikapSave" class="primary">Simpan Penilaian</button>' +
    '</form>'
  );
  $('sikapSave').onclick = function() {
    genericFormSave($('sikapForm'), 'saveSikap');
  };
}

function showRetorikaForm() {
  if (['BPM','SENAT','SC','ADMIN'].indexOf(BM42.role) === -1) {
    setStatus('Role ini tidak memiliki akses penilaian Retorika.', 'error');
    return;
  }

  var fields = [
    ['Tegas','Tegas'],['Kritis','Kritis'],['Percaya_Diri','Percaya diri'],
    ['Wawasan_Luas','Wawasan luas'],['Ramah','Ramah'],['Sopan','Sopan'],
    ['Serius','Serius'],['Keterbukaan_Masukan','Keterbukaan terhadap masukan'],
    ['Pengendalian_Diri','Pengendalian diri']
  ];

  openForm(
    'Retorika',
    BM42.participant.id + ' • skala -3 sampai +3',
    '<form id="retForm">' +
      '<div><label>Pos</label><input name="post" placeholder="Contoh: Pos 01" required></div>' +
      fields.map(function(f) { return radioScale(f[0], f[1]); }).join('') +
      '<label>Catatan</label><textarea name="catatan"></textarea>' +
      '<button type="button" id="retSave" class="primary">Simpan Penilaian</button>' +
    '</form>'
  );

  $('retSave').onclick = function() { genericFormSave($('retForm'), 'saveRetorika'); };
}

function showProblemForm() {
  if (['SC','ADMIN'].indexOf(BM42.role) === -1) {
    setStatus('Problem Solving hanya dapat diisi oleh Steering Committee atau Admin.', 'error');
    return;
  }

  var fields = [
    ['Komunikasi','Komunikasi'],['Percaya_Diri','Percaya diri'],
    ['Pemahaman_Bahasan','Pemahaman bahasan'],['Keaktifan','Keaktifan'],
    ['Kritis','Berpikir kritis'],['Struktur_Berpikir','Struktur berpikir'],
    ['Ketepatan_Solusi','Ketepatan solusi'],['Kolaborasi','Kolaborasi']
  ];

  openForm(
    'Problem Solving',
    BM42.participant.id + ' • evaluator: Steering Committee',
    '<form id="problemForm">' +
      '<div><label>Pos / sesi</label><input name="pos" placeholder="Contoh: Pos 01" required></div>' +
      fields.map(function(f) { return radioScale(f[0], f[1]); }).join('') +
      '<label>Catatan</label><textarea name="catatan"></textarea>' +
      '<button type="button" id="problemSave" class="primary">Simpan Penilaian</button>' +
    '</form>'
  );

  $('problemSave').onclick = function() { genericFormSave($('problemForm'), 'saveProblem'); };
}

function showPostTestForm() {
  openForm(
    'Post-Test',
    BM42.participant.id + ' • ' + BM42.participant.name,
    '<form id="postForm" class="grid-2">' +
      '<div><label>Materi</label><select name="materi">' +
        '<option>Materi 1</option><option>Materi 2</option><option>Materi 3</option>' +
        '<option>Materi 4</option><option>Materi 5</option><option>Materi 6</option>' +
      '</select></div>' +
      '<div><label>Nilai</label><input name="nilai" type="number" min="0" max="100" required></div>' +
      '<div class="full"><label>Catatan</label><textarea name="catatan"></textarea></div>' +
      '<div class="full"><button type="button" id="postSave" class="primary">Simpan Nilai</button></div>' +
    '</form>'
  );

  $('postSave').onclick = function() { genericFormSave($('postForm'), 'savePostTest'); };
}

function showTasksForm() {
  openForm(
    'Tugas',
    'Tugas 1 & 4 = kelompok • Tugas 2 & 3 = individu',
    '<div class="tabs">' +
      '<button class="tab active" data-tasktab="individual">Tugas Individu</button>' +
      '<button class="tab" data-tasktab="group">Tugas Kelompok</button>' +
    '</div>' +
    '<div id="taskTabBody"></div>'
  );

  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.onclick = function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      renderTaskTab(tab.getAttribute('data-tasktab'));
    };
  });

  renderTaskTab('individual');
}

function renderTaskTab(mode) {
  if (mode === 'individual') {
    $('taskTabBody').innerHTML =
      '<form id="taskIndForm" class="grid-2">' +
        '<div><label>Jenis tugas</label><select name="jenisTugas"><option>Tugas 2</option><option>Tugas 3</option></select></div>' +
        '<div><label>Status pengumpulan</label><select name="statusPengumpulan"><option>Sudah dikumpulkan</option><option>Belum dikumpulkan</option></select></div>' +
        '<div><label>Skor 1</label><input type="number" name="skor1" min="0" max="100"></div>' +
        '<div><label>Skor 2</label><input type="number" name="skor2" min="0" max="100"></div>' +
        '<div><label>Skor 3</label><input type="number" name="skor3" min="0" max="100"></div>' +
        '<div class="full"><label>Catatan</label><textarea name="catatan"></textarea></div>' +
        '<div class="full"><button type="button" id="taskIndSave" class="primary">Simpan Nilai Individu</button></div>' +
      '</form>';

    $('taskIndSave').onclick = function() { genericFormSave($('taskIndForm'), 'saveTaskIndividual'); };
  } else {
    $('taskTabBody').innerHTML =
      '<div class="grid-2">' +
        '<div><label>Kelompok</label><select id="groupTaskGroup">' + groupOptions() + '</select></div>' +
        '<div><label>Jenis tugas</label><select id="groupTaskType"><option>Tugas 1</option><option>Tugas 4</option></select></div>' +
        '<div><label>Status pengumpulan</label><select id="groupTaskStatus"><option>Sudah dikumpulkan</option><option>Belum dikumpulkan</option></select></div>' +
        '<div><label>Skor 1</label><input id="gt1" type="number" min="0" max="100"></div>' +
        '<div><label>Skor 2</label><input id="gt2" type="number" min="0" max="100"></div>' +
        '<div><label>Skor 3</label><input id="gt3" type="number" min="0" max="100"></div>' +
        '<div class="full"><label>Catatan</label><textarea id="gtNote"></textarea></div>' +
        '<div class="full"><button id="groupTaskSave" class="primary">Simpan Nilai Kelompok</button></div>' +
      '</div>';

    $('groupTaskSave').onclick = function() {
      var data = {
        op: 'saveTaskGroup',
        evaluatorId: BM42.evaluatorId,
        role: BM42.role,
        group: $('groupTaskGroup').value,
        jenisTugas: $('groupTaskType').value,
        statusPengumpulan: $('groupTaskStatus').value,
        skor1: $('gt1').value,
        skor2: $('gt2').value,
        skor3: $('gt3').value,
        catatan: $('gtNote').value
      };

      setStatus('Menyimpan nilai kelompok...');
      api('assessment', data).then(function(r) {
        if (!r.ok) throw new Error(r.message || 'Gagal menyimpan.');
        setStatus(r.message, 'ok');
      }).catch(function(err) {
        setStatus(err.message, 'error');
      });
    };
  }
}

function groupOptions() {
  var out = '<option value="">Pilih kelompok</option>';
  for (var i = 1; i <= 20; i++) {
    var g = 'G' + String(i).padStart(2, '0');
    out += '<option value="' + g + '">' + g + '</option>';
  }
  return out;
}

function showIncidentForm() {
  openForm(
    'Catatan Kejadian',
    BM42.participant.id + ' • catatan harus faktual dan spesifik',
    '<form id="incidentForm">' +
      '<div class="grid-2">' +
        '<div><label>Aktivitas</label><input name="aktivitas" placeholder="Contoh: Retorika • Pos 04"></div>' +
        '<div><label>Kategori</label><select name="kategori">' +
          '<option>Disiplin</option><option>Atribut</option><option>Kesopanan</option>' +
          '<option>Tanggung jawab</option><option>Kepatuhan instruksi</option>' +
          '<option>Profesionalisme</option><option>Lainnya</option>' +
        '</select></div>' +
        '<div><label>Tingkat</label><select name="tingkat"><option>Ringan</option><option>Sedang</option><option>Berat</option></select></div>' +
        '<div><label>Tautan bukti</label><input name="tautanBukti" placeholder="https://..."></div>' +
        '<div class="full"><label>Uraian kejadian</label><textarea name="uraian" required></textarea></div>' +
      '</div>' +
      '<button type="button" id="incidentSave" class="primary">Simpan Catatan</button>' +
    '</form>'
  );
  $('incidentSave').onclick = function() { genericFormSave($('incidentForm'), 'saveIncident'); };
}

function showAssignmentForm() {
  if (['OC','PERSONALIA','ADMIN'].indexOf(BM42.role) === -1) {
    setStatus('Menu Pembagian Post-Test hanya untuk OC, Personalia, dan Admin.', 'error');
    return;
  }

  openForm(
    'Pembagian Post-Test',
    'Kelompok berdiskusi terlebih dahulu. Sistem hanya memvalidasi dan mencatat keputusan.',
    '<div class="grid-2">' +
      '<div><label>Kelompok</label><select id="assignmentGroup">' + groupOptions() + '</select></div>' +
      '<div><label>Status</label><strong id="assignmentState" class="state">BELUM DIKUNCI</strong></div>' +
    '</div>' +
    '<div class="counter-grid">' +
      '<div>Materi 4<strong id="c4">0/4</strong></div>' +
      '<div>Materi 5<strong id="c5">0/3</strong></div>' +
      '<div>Materi 6<strong id="c6">0/3</strong></div>' +
    '</div>' +
    '<div id="assignmentRows" class="assignment-rows">Pilih kelompok.</div>' +
    '<div class="inline">' +
      '<button id="saveDraftAssignment" class="secondary">Simpan Draft</button>' +
      '<button id="lockAssignment" class="primary">Simpan & Kunci</button>' +
      '<button id="unlockAssignment" class="warning hidden">Buka Kunci (Admin)</button>' +
    '</div>'
  );

  $('assignmentGroup').onchange = loadAssignment;
  $('saveDraftAssignment').onclick = function() { saveAssignment('DRAFT'); };
  $('lockAssignment').onclick = function() { saveAssignment('LOCKED'); };
  $('unlockAssignment').onclick = function() { unlockAssignment(); };
}

function loadAssignment() {
  var group = $('assignmentGroup').value;
  if (!group) {
    $('assignmentRows').innerHTML = 'Pilih kelompok.';
    return;
  }

  setStatus('Memuat anggota ' + group + '...');
  api('assessment', {
    op: 'getPostTestAssignment',
    group: group
  }).then(function(r) {
    if (!r.ok) throw new Error(r.message || 'Gagal memuat assignment.');

    $('assignmentState').textContent = r.locked ? 'TERKUNCI' : 'BELUM DIKUNCI';
    $('assignmentState').className = 'state ' + (r.locked ? 'locked' : 'draft');

    $('assignmentRows').innerHTML = r.assignments.map(function(x) {
      return '<div class="assignment-row">' +
        '<div><b>' + esc(x.participant.id) + '</b> ' + esc(x.participant.name) +
          '<small>' + esc(x.participant.drug) + '</small></div>' +
        '<select class="assign-select" data-pid="' + esc(x.participantId) + '"' + (r.locked ? ' disabled' : '') + '>' +
          '<option value="">Pilih...</option>' +
          '<option value="Materi 4"' + (x.materi === 'Materi 4' ? ' selected' : '') + '>Materi 4</option>' +
          '<option value="Materi 5"' + (x.materi === 'Materi 5' ? ' selected' : '') + '>Materi 5</option>' +
          '<option value="Materi 6"' + (x.materi === 'Materi 6' ? ' selected' : '') + '>Materi 6</option>' +
        '</select>' +
      '</div>';
    }).join('');

    document.querySelectorAll('.assign-select').forEach(function(s) {
      s.onchange = updateAssignmentCounters;
    });

    updateAssignmentCounters();

    $('unlockAssignment').classList.toggle('hidden', !(r.locked && BM42.role === 'ADMIN'));
    $('saveDraftAssignment').disabled = r.locked;
    $('lockAssignment').disabled = r.locked;

    setStatus('Assignment ' + group + ' berhasil dimuat.', 'ok');
  }).catch(function(err) {
    setStatus(err.message, 'error');
  });
}

function updateAssignmentCounters() {
  var c4 = 0, c5 = 0, c6 = 0;
  document.querySelectorAll('.assign-select').forEach(function(s) {
    if (s.value === 'Materi 4') c4++;
    if (s.value === 'Materi 5') c5++;
    if (s.value === 'Materi 6') c6++;
  });
  $('c4').textContent = c4 + '/4';
  $('c5').textContent = c5 + '/3';
  $('c6').textContent = c6 + '/3';
}

function collectAssignments() {
  return Array.from(document.querySelectorAll('.assign-select')).map(function(s) {
    return {
      participantId: s.getAttribute('data-pid'),
      materi: s.value
    };
  });
}

function saveAssignment(mode) {
  var group = $('assignmentGroup').value;
  var assignments = collectAssignments();

  if (!group) {
    setStatus('Pilih kelompok.', 'error');
    return;
  }

  setStatus('Memvalidasi pembagian 4–3–3...');
  api('assessment', {
    op: 'savePostTestAssignment',
    group: group,
    mode: mode,
    assignmentsJson: JSON.stringify(assignments),
    evaluatorId: BM42.evaluatorId,
    role: BM42.role
  }).then(function(r) {
    if (!r.ok) throw new Error(r.message || 'Gagal menyimpan assignment.');
    setStatus(mode === 'LOCKED' ? 'Pembagian berhasil disimpan dan dikunci.' : 'Draft pembagian berhasil disimpan.', 'ok');
    loadAssignment();
  }).catch(function(err) {
    setStatus(err.message, 'error');
  });
}

function unlockAssignment() {
  var group = $('assignmentGroup').value;
  if (BM42.role !== 'ADMIN') {
    setStatus('Hanya Admin yang dapat membuka kunci.', 'error');
    return;
  }

  setStatus('Membuka kunci assignment...');
  api('assessment', {
    op: 'unlockPostTestAssignment',
    group: group,
    evaluatorId: BM42.evaluatorId,
    role: BM42.role
  }).then(function(r) {
    if (!r.ok) throw new Error(r.message || 'Gagal membuka kunci.');
    setStatus('Assignment dibuka kembali. Silakan revisi.', 'ok');
    loadAssignment();
  }).catch(function(err) {
    setStatus(err.message, 'error');
  });
}

function showParticipantAudit() {
  if (!BM42.participant) {
    setStatus('Pilih peserta terlebih dahulu.', 'error');
    return;
  }

  openForm(
    'Audit Kelengkapan Peserta',
    BM42.participant.id + ' • ' + BM42.participant.name,
    '<div id="participantAuditResult" class="loading">Memeriksa...</div>'
  );

  api('assessment', {
    op: 'auditParticipant',
    participantId: BM42.participant.id
  }).then(function(r) {
    if (!r.ok) throw new Error(r.message || 'Audit gagal.');
    $('participantAuditResult').innerHTML =
      '<div class="audit-grid">' +
      r.items.map(function(x) {
        return '<div class="audit-item ' + (x.actionRequired ? 'missing' : 'done') + '">' +
          '<span>' + esc(x.component) + '</span><strong>' + x.status + '</strong>' +
        '</div>';
      }).join('') +
      '</div>';
  }).catch(function(err) {
    $('participantAuditResult').innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
  });
}

function showAuditComponent() {
  openForm(
    'Audit Kelengkapan',
    'Gunakan filter agar daftar peserta yang belum dinilai langsung muncul.',
    '<div class="grid-2">' +
      '<div><label>Komponen</label><select id="auditComponent">' +
        '<option>Post-Test</option><option>Tugas</option><option>Sikap Peserta</option>' +
        '<option>Retorika</option><option>Problem Solving</option><option>Keaktifan Materi</option>' +
      '</select></div>' +
      '<div><label>Unit / bagian</label><input id="auditUnit" placeholder="Contoh: Materi 4 / Tugas 1 / Pos 01"></div>' +
      '<div><label>Kelompok</label><select id="auditGroup">' + groupOptions().replace('Pilih kelompok','Semua Kelompok') + '</select></div>' +
      '<div class="align-end"><button id="auditRun" class="primary">Periksa</button></div>' +
    '</div>' +
    '<div id="auditComponentResult"></div>'
  );

  $('auditRun').onclick = function() {
    var component = $('auditComponent').value;
    var unit = $('auditUnit').value.trim();
    var group = $('auditGroup').value || 'Semua Kelompok';

    $('auditComponentResult').innerHTML = '<div class="loading">Memeriksa...</div>';

    api('assessment', {
      op: 'auditComponent',
      component: component,
      unit: unit,
      group: group
    }).then(function(r) {
      if (!r.ok) throw new Error(r.message || 'Audit gagal.');

      $('auditComponentResult').innerHTML =
        '<div class="audit-summary"><b>' + r.complete + '/' + r.total + '</b> lengkap • <b>' + r.missingCount + '</b> belum dinilai</div>' +
        (r.missing.length ? r.missing.map(function(x) {
          return '<div class="missing-row"><b>' + esc(x.id) + '</b> ' + esc(x.name) +
            '<small>' + esc(x.group) + ' • ' + esc(x.drug) + '</small></div>';
        }).join('') : '<div class="success-box">Semua peserta pada filter tersebut sudah lengkap.</div>');
    }).catch(function(err) {
      $('auditComponentResult').innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
    });
  };
}

function showRanking() {
  openForm(
    'Top 10 & Rekap Kelompok',
    'Hanya peserta dan kelompok yang lengkap yang dapat masuk ranking.',
    '<button id="reloadRanking" class="primary">Muat Rekap</button>' +
    '<div id="rankingBody" class="loading">Tekan Muat Rekap.</div>'
  );

  $('reloadRanking').onclick = function() {
    $('rankingBody').innerHTML = '<div class="loading">Memuat ranking...</div>';

    Promise.all([
      api('assessment', { op: 'top10' }),
      api('assessment', { op: 'groupRanking' })
    ]).then(function(results) {
      var top = results[0];
      var groups = results[1];
      if (!top.ok) throw new Error(top.message || 'Gagal memuat Top 10.');
      if (!groups.ok) throw new Error(groups.message || 'Gagal memuat ranking kelompok.');

      $('rankingBody').innerHTML =
        '<h3>Top 10 Peserta</h3>' +
        (top.rows.length ? top.rows.map(function(x) {
          return '<div class="rank-row"><b>#' + x.rank + '</b><span>' + esc(x.name) +
            '<small>' + esc(x.participantId) + ' • ' + esc(x.group) + '</small></span>' +
            '<strong>' + x.finalScore.toFixed(2) + '</strong></div>';
        }).join('') : '<div>Belum ada peserta lengkap.</div>') +
        '<h3>Ranking Kelompok</h3>' +
        (groups.rows.length ? groups.rows.map(function(x) {
          return '<div class="rank-row"><b>#' + x.rank + '</b><span>' + esc(x.group) +
            '<small>' + x.complete + '/' + x.participants + ' lengkap</small></span>' +
            '<strong>' + x.averageFinal.toFixed(2) + '</strong></div>';
        }).join('') : '<div>Belum ada kelompok lengkap.</div>');
    }).catch(function(err) {
      $('rankingBody').innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
    });
  };
}

function refreshState() {
  api('state', {}, 10000).then(function(r) {
    if (!r.ok) throw new Error(r.message || 'Backend error');
    $('backendBadge').textContent = 'TERHUBUNG';
    $('backendBadge').className = 'badge ok';
    $('serverTime').textContent = (r.serverTime || '').split(' ').pop() || '--:--:--';
  }).catch(function(err) {
    $('backendBadge').textContent = 'BACKEND ERROR';
    $('backendBadge').className = 'badge error';
    $('serverTime').textContent = '--:--:--';
  });
}

document.addEventListener('DOMContentLoaded', function() {
  restoreIdentity();
  enableModules(false);

  $('saveIdentity').onclick = saveIdentity;
  $('searchBtn').onclick = searchParticipant;
  $('searchInput').onkeydown = function(e) {
    if (e.key === 'Enter') searchParticipant();
  };
  $('closeForm').onclick = closeForm;
  $('auditButton').onclick = showAuditComponent;
  $('rankingButton').onclick = showRanking;
  $('assignmentButton').onclick = showAssignmentForm;

  document.querySelectorAll('.module').forEach(function(btn) {
    btn.onclick = function() {
      if (!requireParticipant()) return;
      var section = btn.getAttribute('data-section');
      if (section === 'activity') showActivityForm();
      if (section === 'posttest') showPostTestForm();
      if (section === 'retorika') showRetorikaForm();
      if (section === 'sikap') showSikapForm();
      if (section === 'problem') showProblemForm();
      if (section === 'tasks') showTasksForm();
      if (section === 'incident') showIncidentForm();
    };
  });

  refreshState();
  setInterval(refreshState, 15000);
});
