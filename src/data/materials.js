// 養成素材定義。MVP 先用單一通用素材；保留多素材結構便於擴充。

export const MATERIALS = {
  essence: {
    id: 'essence',
    label: '養成精華',
    icon: '🔹',
    desc: '升級角色所需的通用養成素材。',
  },
};

export const MATERIAL_LIST = Object.values(MATERIALS);
