import os
import json
import shutil
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'input.json')
IMAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'new_images')
MASTER_JSON = os.path.join(BASE_DIR, 'fish_master.json')

IMG_DEST = [
    os.path.join(BASE_DIR, 'downloaded_images'),
    os.path.join(BASE_DIR, 'downloaded_images2'),
    os.path.join(BASE_DIR, 'downloaded_images3')
]

def main():
    with open(INPUT_JSON, 'r', encoding='utf-8') as f:
        new_fish = json.loads(f.read())

    # 1. マスターJSON読み込みとID付与
    with open(MASTER_JSON, 'r', encoding='utf-8') as f:
        master_data = json.load(f)
    
    ids = [int(f['id'].split('_')[1]) for f in master_data if f['id'].startswith('fish_')]
    next_id = f"fish_{max(ids) + 1:04d}" if ids else "fish_0001"
    new_fish['id'] = next_id

    # 2. 画像のリネームと振り分け（枚数不明対応）
    images = sorted(glob.glob(os.path.join(IMAGE_DIR, '*.*')))
    base = new_fish.pop('filename_base') # JSONからは削除
    
    # 画像ファイル名をJSONにセットするためのキー
    img_keys = ['image', 'image2', 'image3']
    
    for i in range(3):
        if i < len(images):
            ext = os.path.splitext(images[i])[1]
            filename = f"{base}{i+1}{ext}"
            new_fish[img_keys[i]] = filename
            
            # 移動先へリネームして保存
            shutil.move(images[i], os.path.join(IMG_DEST[i], filename))
            print(f"📸 画像設定: {filename}")
        else:
            new_fish[img_keys[i]] = "欠損"

    # 3. JSON保存
    master_data.append(new_fish)
    with open(MASTER_JSON, 'w', encoding='utf-8') as f:
        json.dump(master_data, f, ensure_ascii=False, indent=2)

    # 4. 後処理
    with open(INPUT_JSON, 'w', encoding='utf-8') as f: f.write("")
    print(f"🎉 登録完了: {new_fish['name']} (ID: {next_id})")

if __name__ == "__main__":
    main()