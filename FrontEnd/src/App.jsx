import { useState, useRef, useEffect } from "react";
import axios from "axios";
import "./App.css";

// =================================================================
// ZONE 1: THÔNG SỐ CẤU HÌNH & TRẠNG THÁI KHỞI TẠO (STATES & CONFIG)
// =================================================================
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

function App() {
  // --- 1.1. Hệ Thống Xác Thực Phiên Làm Việc ---
  const [isAuthenticated, setIsAuthenticated] = useState(false); // [cite: 31]
  const [authMode, setAuthMode] = useState("login"); // [cite: 32]
  const [username, setUsername] = useState(""); // [cite: 32]
  const [password, setPassword] = useState(""); // [cite: 32]

  // --- 1.2. Quản Lý Dữ Liệu Tệp Tin & Giao Diện ---
  const [items, setItems] = useState([]); // [cite: 33]
  const [loading, setLoading] = useState(false); // [cite: 34]
  const [activeTab, setActiveTab] = useState("my_drive"); // [cite: 34]
  const [searchTerm, setSearchTerm] = useState(""); // [cite: 34]
  const [previewImage, setPreviewImage] = useState(null); // [cite: 34]

  // --- 1.3. Trạng Thái Menus & Tương Tác Kéo Thả ---
  const [showNewMenu, setShowNewMenu] = useState(false); // [cite: 35]
  const [menuOpenId, setMenuOpenId] = useState(null); // [cite: 35]
  const [currentFolder, setCurrentFolder] = useState(null); // [cite: 36]
  const [dragActive, setDragActive] = useState(false); // [cite: 37]
  const [selectedIds, setSelectedIds] = useState([]); // [cite: 38]

  // --- 1.4. Quản Lý Khối Điều Hướng Tìm Kiếm Chuột (Lasso) ---
  const [selectionBox, setSelectionBox] = useState(null); // [cite: 40]
  const fileInputRef = useRef(null); // [cite: 39]
  const folderInputRef = useRef(null); // [cite: 39]
  const listRef = useRef(null); // [cite: 40]

  // =================================================================
  // ZONE 2: ĐỒNG BỘ DỮ LIỆU ĐÁM MÂY (CLOUD SYNC HÀM ĐỌC)
  // =================================================================

  // --- 2.1. Quét Bộ Nhớ Duy Trì Phiên Khi Reload (F5) ---
  useEffect(() => {
    const savedUserId = localStorage.getItem("x_user_id"); // [cite: 41]
    if (savedUserId) {
      setIsAuthenticated(true); // [cite: 41]
      setUsername(savedUserId); // [cite: 41]
      fetchUserFiles(savedUserId); // Đồng bộ danh sách ảnh từ S3 ngay lập tức [cite: 41]
    }
  }, []);

  // --- 2.2. API Đọc Danh Sách Ảnh Từ Kho S3 Về ---
  const fetchUserFiles = async (userId) => {
    setLoading(true);

    try {
      const token = localStorage.getItem("access_token");

      const response = await axios.get(`${API_BASE_URL}/list-files`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.status === "success") {
        const mappedItems = response.data.files.map((file, index) => {
          const filename = file.storage_path.split("/").pop();

          return {
            id: `s3_${index}_${Date.now()}`,
            name: filename,
            type: "image",
            parentId: "root",
            cloudUrl: file.signed_url,
            storagePath: file.storage_path,
            localUrl: file.signed_url,
            uploadDate: "Đã lưu trên Cloud S3",
            owner: "tôi",
            size: "—",
            // Trạng thái thùng rác được lấy từ backend.
            // File vẫn tồn tại trên S3 cho đến khi xóa vĩnh viễn.
            isTrashed: file.is_trashed === true,
            // Đánh dấu trạng thái yêu thích từ dữ liệu backend.
            isStarred: file.is_favorite === true,
          };
        });

        setItems(mappedItems);
      }
    } catch (error) {
      console.error("Lỗi khi đồng bộ danh sách tệp từ S3:", error);

      if (error.response?.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("x_user_id");

        setIsAuthenticated(false);
        setItems([]);
        setUsername("");
        setPassword("");

        alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
        return;
      }

      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // =================================================================
  // ZONE 3: HỆ THỐNG XỬ LÝ LỰA CHỌN & CHUỘT (LASSO & MOUSE EVENTS)
  // =================================================================
  const handleMouseDown = (e) => {
    if (
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest(".dropdown-menu")
    )
      return; // [cite: 49]
    setSelectionBox({
      startX: e.clientX,
      startY: e.clientY,
      endX: e.clientX,
      endY: e.clientY,
    }); // [cite: 50]
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!selectionBox) return; // [cite: 51]
      setSelectionBox((prev) => ({
        ...prev,
        endX: e.clientX,
        endY: e.clientY,
      })); // [cite: 51]

      const top = Math.min(selectionBox.startY, e.clientY); // [cite: 51]
      const left = Math.min(selectionBox.startX, e.clientX); // [cite: 51]
      const bottom = Math.max(selectionBox.startY, e.clientY); // [cite: 51]
      const right = Math.max(selectionBox.startX, e.clientX); // [cite: 51, 52]

      const rows = document.querySelectorAll(".list-row"); // [cite: 52]
      const newlySelected = []; // [cite: 52]

      rows.forEach((row) => {
        const rowRect = row.getBoundingClientRect(); // [cite: 52]
        if (
          rowRect.left < right &&
          rowRect.right > left &&
          rowRect.top < bottom &&
          rowRect.bottom > top
        ) {
          // [cite: 52, 53]
          newlySelected.push(row.getAttribute("data-id")); // [cite: 53]
        }
      });
      setSelectedIds(newlySelected); // [cite: 53]
    };

    const handleMouseUp = () => {
      setSelectionBox(null);
    }; // [cite: 53, 54]

    if (selectionBox) {
      window.addEventListener("mousemove", handleMouseMove); // [cite: 54]
      window.addEventListener("mouseup", handleMouseUp); // [cite: 54]
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove); // [cite: 55]
      window.removeEventListener("mouseup", handleMouseUp); // [cite: 55]
    };
  }, [selectionBox]);

  // =================================================================
  // ZONE 4: HỆ THỐNG TÁC VỤ NGƯỜI DÙNG (AUTH & WRITE ACTIONS)
  // =================================================================

  // --- 4.1. Xử Lý Đăng Ký / Đăng Nhập Tài Khoản ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault(); // [cite: 56]
    if (!username || !password) {
      alert("Vui lòng nhập đầy đủ thông tin!"); // [cite: 57]
      return; // [cite: 57]
    }

    const authPayload = { username: username, password: password };

    if (authMode === "register") {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/register`,
          authPayload,
        ); // [cite: 58]
        if (response.data.status === "success") {
          // [cite: 59]
          alert("Đăng ký tài khoản bảo mật thành công! Hãy đăng nhập lại."); // [cite: 59]
          setAuthMode("login"); // [cite: 60]
          setPassword(""); // [cite: 60]
          setUsername("");
        }
      } catch (error) {
        alert(error.response?.data?.detail || "Đăng ký thất bại!"); // [cite: 60, 61]
      }
    } else {
      try {
        const response = await axios.post(`${API_BASE_URL}/login`, authPayload); // [cite: 61]
        if (response.data.status === "success") {
          // [cite: 62]
          localStorage.setItem("x_user_id", response.data.username); // Lưu phiên làm việc [cite: 62]
          localStorage.setItem("access_token", response.data.access_token);
          setIsAuthenticated(true); // [cite: 63]
          fetchUserFiles(response.data.username); // Quét nạp ảnh từ S3 [cite: 63]
        }
      } catch (error) {
        alert(error.response?.data?.detail || "Sai tài khoản hoặc mật khẩu!"); // [cite: 64]
      }
    }
  };

  const handleLogout = () => {
    // Xóa toàn bộ thông tin phiên đăng nhập.
    localStorage.removeItem("x_user_id");
    localStorage.removeItem("access_token");

    // Đưa giao diện về trạng thái chưa đăng nhập.
    setIsAuthenticated(false);
    setItems([]);
    setUsername("");
    setPassword("");
  };

  // --- 4.2. Xử Lý Khởi Tạo Album / Thư Mục Trực Quan ---
  const handleCreateFolderOrAlbum = (type) => {
    setShowNewMenu(false); // [cite: 67]
    const name = prompt(
      `Nhập tên ${type === "folder" ? "Thư mục" : "Album ảnh"} mới:`,
    ); // [cite: 68]
    if (!name) return; // [cite: 69]

    const today = new Date(); // [cite: 69]
    const newItem = {
      id: "dir_" + Date.now(), // [cite: 69]
      name: name, // [cite: 69]
      type: type, // [cite: 69]
      parentId: currentFolder ? currentFolder.id : "root", // [cite: 69, 70]
      uploadDate: `Bạn đã tạo • ${today.getDate()} thg ${today.getMonth() + 1}`, // [cite: 70]
      owner: "tôi", // [cite: 70]
      size: "—", // [cite: 70]
      isTrashed: false, // [cite: 70]
    };
    setItems((prev) => [newItem, ...prev]); // [cite: 71]
  };

  // --- 4.3. Xử Lý Tải Ảnh Lên AWS S3 (Vá Lỗi Delay Của Chỉ Mục Đám Mây) ---
  const handleUploadFiles = async (fileList, folderName = "") => {
    if (!fileList || fileList.length === 0) return;

    setLoading(true);

    const allowedExtensions = ["image/jpeg", "image/png", "image/jpg"];

    const uploadedItems = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      if (!allowedExtensions.includes(file.type)) {
        alert(
          `Tệp [${file.name}] sai định dạng! Chỉ nhận ảnh .jpg, .jpeg, .png`,
        );
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);

      try {
        const token = localStorage.getItem("access_token");

        const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.data.status === "success") {
          uploadedItems.push({
            id: `s3_${Date.now()}_${i}`,
            name: response.data.storage_path.split("/").pop(),
            type: "image",
            parentId: currentFolder ? currentFolder.id : "root",
            cloudUrl: response.data.signed_url,
            storagePath: response.data.storage_path,
            localUrl: response.data.signed_url,
            uploadDate: "Vừa tải lên",
            owner: "tôi",
            size: "—",
            isTrashed: false,
          });
        }
      } catch (error) {
        if (error.response?.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("x_user_id");

          setIsAuthenticated(false);
          setItems([]);
          setUsername("");
          setPassword("");

          alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
          break;
        }

        alert(error.response?.data?.detail || `Lỗi tải tệp: ${file.name}`);
      }
    }

    if (uploadedItems.length > 0) {
      setItems((prev) => [...uploadedItems, ...prev]);
    }

    setLoading(false);
    setShowNewMenu(false);
  };

  // --- 4.4. Hệ Thống Các Tác Vụ Giao Diện Khác ---
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation(); // [cite: 80]
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } // [cite: 81]
    else if (e.type === "dragleave") {
      setDragActive(false);
    } // [cite: 82]
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false); // [cite: 83]
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files); // [cite: 84]
    }
  };

  const toggleMenu = (id, e) => {
    e.stopPropagation(); // [cite: 85]
    setMenuOpenId(menuOpenId === id ? null : id); // [cite: 85]
  };

  const handleCopyLink = async (cloudUrl, e) => {
    if (e) e.stopPropagation();

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(cloudUrl);
        alert("Đã sao chép đường dẫn chia sẻ!");
      } else {
        window.prompt(
          "Trình duyệt không cho phép tự động copy trên HTTP. Hãy copy đường dẫn bên dưới:",
          cloudUrl,
        );
      }
    } catch (error) {
      console.error("Không thể sao chép đường dẫn:", error);

      window.prompt(
        "Không thể tự động sao chép. Hãy copy đường dẫn bên dưới:",
        cloudUrl,
      );
    }

    setMenuOpenId(null);
  };

  const handleRowClick = (item) => {
    if (item.type === "folder" || item.type === "album") {
      setCurrentFolder(item);
    } // [cite: 88]
    else if (item.type === "image") {
      setPreviewImage(item);
    } // [cite: 89]
  };

  const handleSelectItem = (id, e) => {
    e.stopPropagation(); // [cite: 90]
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } // [cite: 91]
    else {
      setSelectedIds([...selectedIds, id]);
    } // [cite: 92]
  };
  // =================================================================
  // BẬT / TẮT TRẠNG THÁI YÊU THÍCH
  // =================================================================

  const handleToggleFavorite = async (item, e) => {
    // Ngăn click lan ra ngoài làm mở ảnh.
    if (e) {
      e.stopPropagation();
    }

    const token = localStorage.getItem("access_token");

    try {
      const response = await axios.post(
        `${API_BASE_URL}/favorites/toggle`,
        {
          storage_path: item.storagePath,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      // Cập nhật ngay giao diện mà không cần tải lại toàn bộ danh sách.
      setItems((prevItems) =>
        prevItems.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                isStarred: response.data.is_favorite,
              }
            : currentItem,
        ),
      );

      // Đóng menu ba chấm sau khi thao tác.
      setMenuOpenId(null);
    } catch (error) {
      console.error("Lỗi cập nhật trạng thái yêu thích:", error);

      if (error.response?.status === 401) {
        localStorage.removeItem("access_token");
        setIsAuthenticated(false);

        alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
      } else {
        alert("Không thể cập nhật trạng thái yêu thích.");
      }
    }
  };
  // --- 4.5. API Yêu Cầu Xóa Tệp Vĩnh Viễn Trên S3 (Anti-IDOR) ---
  // =================================================================
  // CHUYỂN TỆP VÀO THÙNG RÁC
  // -----------------------------------------------------------------
  // Không xóa file khỏi S3 ngay.
  // Backend chỉ lưu trạng thái is_trashed theo từng user.
  // =================================================================

  const handleMoveToTrash = async () => {
    if (selectedIds.length === 0) return;

    const confirmTrash = window.confirm(
      `Bạn có muốn chuyển ${selectedIds.length} mục vào Thùng rác không?`,
    );

    if (!confirmTrash) return;

    setLoading(true);

    const token = localStorage.getItem("access_token");

    for (const id of selectedIds) {
      const targetItem = items.find((item) => item.id === id);

      if (targetItem && targetItem.type === "image") {
        try {
          await axios.post(
            `${API_BASE_URL}/trash/toggle`,
            {
              storage_path: targetItem.storagePath,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
        } catch (error) {
          console.error("Lỗi khi chuyển file vào Thùng rác:", error);

          if (error.response?.status === 401) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("x_user_id");

            setIsAuthenticated(false);
            setItems([]);
            setUsername("");
            setPassword("");

            alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
            break;
          }
        }
      }
    }

    // Đồng bộ lại danh sách để nhận trạng thái is_trashed mới từ backend.
    await fetchUserFiles(username);

    setSelectedIds([]);
    setLoading(false);

    alert("Đã chuyển tệp vào Thùng rác.");
  };
  // =================================================================
  // KHÔI PHỤC TỆP TỪ THÙNG RÁC
  // =================================================================

  const handleRestoreFromTrash = async () => {
    if (selectedIds.length === 0) return;

    setLoading(true);

    const token = localStorage.getItem("access_token");

    for (const id of selectedIds) {
      const targetItem = items.find((item) => item.id === id);

      if (targetItem && targetItem.type === "image") {
        try {
          await axios.post(
            `${API_BASE_URL}/trash/toggle`,
            {
              storage_path: targetItem.storagePath,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
        } catch (error) {
          console.error("Lỗi khôi phục file:", error);
        }
      }
    }

    await fetchUserFiles(username);

    setSelectedIds([]);
    setLoading(false);

    alert("Đã khôi phục tệp thành công.");
  };
  const closeAllMenus = () => {
    setMenuOpenId(null);
    setShowNewMenu(false);
  }; // [cite: 100]
  // =================================================================
  // XÓA VĨNH VIỄN KHỎI S3
  // Chỉ sử dụng bên trong tab Thùng rác.
  // =================================================================

  const handlePermanentDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmDelete = window.confirm(
      `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedIds.length} mục không? Hành động này không thể hoàn tác.`,
    );

    if (!confirmDelete) return;

    setLoading(true);

    const token = localStorage.getItem("access_token");

    for (const id of selectedIds) {
      const targetItem = items.find((item) => item.id === id);

      if (targetItem && targetItem.type === "image") {
        try {
          await axios.delete(`${API_BASE_URL}/delete`, {
            data: {
              storage_path: targetItem.storagePath,
            },
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (error) {
          console.error("Lỗi xóa vĩnh viễn:", error);
        }
      }
    }

    await fetchUserFiles(username);

    setSelectedIds([]);
    setLoading(false);

    alert("Đã xóa vĩnh viễn tệp khỏi Cloud S3.");
  };
  // =================================================================
  // ZONE 5: KỊCH BẢN HIỂN THỊ HÌNH ẢNH GIAO DIỆN (UI RENDER)
  // =================================================================

  // --- 5.1. Luồng Giao Diện Chưa Xác Thực Tài Khoản ---
  if (!isAuthenticated) {
    // [cite: 101]
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-logo">☁️ CloudDrive Sec</h2>
          <h3 className="auth-title">
            {authMode === "login" ? "Đăng nhập hệ thống" : "Đăng ký tài khoản"}
          </h3>{" "}
          {/* [cite: 101, 102] */}
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {" "}
            {/* [cite: 102] */}
            <div className="input-group">
              <label>Tài khoản</label>
              <input
                type="text"
                value={username}
                placeholder="Nhập tên tài khoản..."
                onChange={(e) => setUsername(e.target.value)}
              />{" "}
              {/* [cite: 102, 103] */}
            </div>
            <div className="input-group">
              <label>Mật khẩu</label>
              <input
                type="password"
                value={password}
                placeholder="Nhập mật khẩu..."
                onChange={(e) => setPassword(e.target.value)}
              />{" "}
              {/* [cite: 103, 104] */}
            </div>
            <button type="submit" className="btn-auth-submit">
              {authMode === "login" ? "Đăng nhập" : "Đăng ký tài khoản"}{" "}
              {/* [cite: 104, 105] */}
            </button>
          </form>
          <div className="auth-switch">
            {authMode === "login" ? ( // [cite: 105, 106]
              <p>
                Chưa có tài khoản?{" "}
                <span onClick={() => setAuthMode("register")}>
                  Đăng ký ngay
                </span>
              </p> // [cite: 106, 107]
            ) : (
              <p>
                Đã có tài khoản?{" "}
                <span onClick={() => setAuthMode("login")}>
                  Quay lại đăng nhập
                </span>
              </p> // [cite: 107, 108]
            )}
          </div>
        </div>
      </div>
    );
  }

  // Khởi chạy bộ lọc tìm kiếm tài nguyên
  /* ================================================================
   BỘ LỌC HIỂN THỊ TÀI NGUYÊN THEO TAB ĐANG CHỌN
   ================================================================ */

  const normalizedSearch = searchTerm.trim().toLowerCase();

  let displayedItems = items.filter((item) => {
    // Kiểm tra từ khóa tìm kiếm.
    const matchSearch = item.name.toLowerCase().includes(normalizedSearch);

    // Nếu đang tìm kiếm, chỉ giữ item phù hợp.
    if (!matchSearch) {
      return false;
    }

    // --------------------------------------------------------------
    // TAB: THÙNG RÁC
    // Chỉ hiển thị tài nguyên đã được đánh dấu xóa mềm.
    // --------------------------------------------------------------
    if (activeTab === "trash") {
      return item.isTrashed === true;
    }

    // Các tab còn lại không hiển thị tài nguyên trong thùng rác.
    if (item.isTrashed) {
      return false;
    }

    // --------------------------------------------------------------
    // TAB: GẦN ĐÂY
    // Hiện tại hiển thị toàn bộ tài nguyên Cloud chưa bị xóa.
    // Việc sắp xếp mới nhất sẽ thực hiện ngay bên dưới.
    // --------------------------------------------------------------
    if (activeTab === "recent") {
      return true;
    }

    // --------------------------------------------------------------
    // TAB: ALBUM
    // Chỉ hiển thị các item được tạo với type = "album".
    // --------------------------------------------------------------
    if (activeTab === "albums") {
      return item.type === "album";
    }

    // --------------------------------------------------------------
    // TAB: YÊU THÍCH
    // Chưa có metadata starred thật nên tạm thời không trả item nào.
    // --------------------------------------------------------------
    if (activeTab === "starred") {
      return item.isStarred === true;
    }

    // --------------------------------------------------------------
    // TAB: ĐƯỢC CHIA SẺ
    // Chưa có metadata shared thật nên tạm thời không trả item nào.
    // --------------------------------------------------------------
    if (activeTab === "shared") {
      return item.isShared === true;
    }

    // --------------------------------------------------------------
    // TAB: DRIVE CỦA TÔI
    // Hiển thị tài nguyên trong thư mục hiện tại.
    // --------------------------------------------------------------
    const targetParent = currentFolder ? currentFolder.id : "root";

    return item.parentId === targetParent;
  });

  /* ================================================================
   SẮP XẾP TAB "GẦN ĐÂY"
   ---------------------------------------------------------------
   Các item upload trong phiên hiện tại có ID chứa timestamp,
   nên ưu tiên hiển thị theo thứ tự mới nhất trước.
   ================================================================ */

  if (activeTab === "recent") {
    displayedItems = [...displayedItems].reverse();
  }

  // --- 5.2. Luồng Giao Diện Trang Chủ (Đã Đăng Nhập Thành Công) ---
  return (
    // Bỏ qua div rỗng chứa thẻ loading cũ để đưa layout flex vào vị trí kiểm soát toàn cục
    <div className="drive-layout" onClick={closeAllMenus}>
      {/* VÁ LỖI: ĐƯA KHỐI LOADING LÊN ĐẦU FILE VÀ ÉP CSS FIX PHỦ TOÀN DIỆN MÀN HÌNH */}
      {loading && ( //
        <div
          className="loading-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(255, 255, 255, 0.8)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div className="spinner"></div> {/*  */}
          <p style={{ marginTop: "10px", fontWeight: "500" }}>
            Hệ thống đang xử lý dữ liệu Cloud...
          </p>{" "}
          {/*  */}
        </div>
      )}

      {/* KHU VỰC THANH ĐIỀU HƯỚNG BÊN TRÁI (SIDEBAR) */}
      <aside className="sidebar">
        <h2 className="logo">☁️ CloudDrive Sec</h2> {/* [cite: 110] */}
        <div className="new-btn-wrapper" onClick={(e) => e.stopPropagation()}>
          {" "}
          {/*  */}
          <button
            className="btn-new"
            onClick={() => setShowNewMenu(!showNewMenu)}
          >
            {" "}
            {/* [cite: 110, 111] */}
            <span className="plus-icon">+</span> Mới
          </button>
          {showNewMenu && ( // [cite: 111]
            <div className="dropdown-menu new-dropdown">
              <div
                className="dropdown-item"
                onClick={() => handleCreateFolderOrAlbum("folder")}
              >
                📁 Thư mục mới
              </div>{" "}
              {/* [cite: 112] */}
              <div
                className="dropdown-item"
                onClick={() => handleCreateFolderOrAlbum("album")}
              >
                🎨 Tạo Album ảnh
              </div>{" "}
              {/* [cite: 112, 113] */}
              <div className="divider"></div> {/* [cite: 113] */}
              <div
                className="dropdown-item"
                onClick={() => fileInputRef.current.click()}
              >
                📄 Tải tệp lên
              </div>{" "}
              {/* [cite: 113, 114] */}
              <div
                className="dropdown-item"
                onClick={() => folderInputRef.current.click()}
              >
                📂 Tải thư mục lên
              </div>{" "}
              {/* [cite: 114, 115] */}
            </div>
          )}
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden-input"
            ref={fileInputRef}
            onChange={(e) => handleUploadFiles(e.target.files)}
          />{" "}
          {/* [cite: 116, 117] */}
          <input
            type="file"
            multiple
            webkitdirectory=""
            directory=""
            className="hidden-input"
            ref={folderInputRef}
            onChange={(e) =>
              handleUploadFiles(
                e.target.files,
                e.target.files[0]?.webkitRelativePath.split("/")[0],
              )
            }
          />{" "}
          {/* [cite: 117, 118] */}
        </div>
        {/* ================================================================
    MENU ĐIỀU HƯỚNG CHÍNH
    Các mục được thiết kế theo đúng chức năng của Photo Share Cloud.
    ================================================================ */}
        <ul className="menu-list">
          {/* Drive chính - hiển thị toàn bộ tài nguyên của người dùng */}
          <li
            className={`menu-item ${activeTab === "my_drive" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("my_drive");
              setCurrentFolder(null);
              setSelectedIds([]);
            }}
          >
            📁 Drive của tôi
          </li>

          {/* Hiển thị các tài nguyên được tải lên gần đây */}
          <li
            className={`menu-item ${activeTab === "recent" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("recent");
              setCurrentFolder(null);
              setSelectedIds([]);
            }}
          >
            🕘 Gần đây
          </li>

          {/* Khu vực quản lý Album ảnh */}
          <li
            className={`menu-item ${activeTab === "albums" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("albums");
              setCurrentFolder(null);
              setSelectedIds([]);
            }}
          >
            🖼️ Album
          </li>

          {/* Các tài nguyên đã được người dùng chia sẻ */}
          <li
            className={`menu-item ${activeTab === "shared" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("shared");
              setCurrentFolder(null);
              setSelectedIds([]);
            }}
          >
            👥 Được chia sẻ
          </li>

          {/* Các tài nguyên được đánh dấu yêu thích */}
          <li
            className={`menu-item ${activeTab === "starred" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("starred");
              setCurrentFolder(null);
              setSelectedIds([]);
            }}
          >
            ⭐ Yêu thích
          </li>

          {/* Khu vực chứa tài nguyên đã chuyển vào thùng rác */}
          <li
            className={`menu-item ${activeTab === "trash" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("trash");
              setCurrentFolder(null);
              setSelectedIds([]);
            }}
          >
            🗑️ Thùng rác
          </li>
        </ul>
      </aside>

      {/* KHU VỰC NỘI DUNG HIỂN THỊ CHÍNH (MAIN CONTENT) */}
      <main className="main-content">
        <header className="header">
          <div className="search-box">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Tìm kiếm tài nguyên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />{" "}
            {/* [cite: 125] */}
          </div>
          <div className="user-actions">
            <span
              style={{
                marginRight: "15px",
                color: "#5f6368",
                fontWeight: "500",
              }}
            >
              👤 {username}
            </span>{" "}
            {/* [cite: 126, 127] */}
            <button className="btn btn-outline" onClick={handleLogout}>
              Đăng xuất
            </button>{" "}
            {/* [cite: 127] */}
          </div>
        </header>

        {/* ================================================================
    CÁC TAB CHƯA CÓ DỮ LIỆU CLOUD THỰC TẾ
    ---------------------------------------------------------------
    Shared và Starred sẽ được triển khai sau khi có metadata backend.
    ================================================================ */}

        {activeTab === "shared" || activeTab === "starred" ? (
          <div className="empty-state">
            <div
              style={{
                fontSize: "52px",
                marginBottom: "16px",
              }}
            >
              {activeTab === "shared" ? "👥" : "⭐"}
            </div>

            <h3>
              {activeTab === "shared"
                ? "Chưa có ảnh được chia sẻ"
                : "Chưa có ảnh yêu thích"}
            </h3>

            <p>
              {activeTab === "shared"
                ? "Các hình ảnh được chia sẻ sẽ xuất hiện tại đây."
                : "Các hình ảnh được đánh dấu yêu thích sẽ xuất hiện tại đây."}
            </p>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}
          >
            {/* KHU VỰC THANH CÔNG CỤ (ACTION BAR) */}
            <div style={{ minHeight: "50px", marginBottom: "15px" }}>
              {selectedIds.length > 0 ? (
                // THANH TÁC VỤ KHI CÓ FILE ĐƯỢC CHỌN (GIAO DIỆN CHUẨN GOOGLE DRIVE)
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#e8f0fe", // Nền xanh nhạt sang trọng
                    borderRadius: "8px",
                    padding: "8px 16px",
                    border: "1px solid #d2e3fc",
                    boxShadow: "0 1px 3px rgba(60,64,67,0.1)",
                    animation: "fadeIn 0.2s ease-in-out",
                  }}
                >
                  {/* Cụm thông tin bên trái */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <button
                      onClick={() => setSelectedIds([])}
                      style={{
                        background: "transparent",
                        border: "none",
                        fontSize: "1.2rem",
                        cursor: "pointer",
                        color: "#1a73e8",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Bỏ chọn tất cả"
                    >
                      ✕
                    </button>
                    <span
                      style={{
                        fontWeight: "500",
                        color: "#1a73e8",
                        fontSize: "0.95rem",
                      }}
                    >
                      Đã chọn {selectedIds.length} mục
                    </span>
                  </div>

                  {/* Cụm nút hành động bên phải */}
                  <div>
                    {activeTab === "trash" ? (
                      <>
                        {/* ============================================================
        TRONG THÙNG RÁC:
        Cho phép khôi phục hoặc xóa vĩnh viễn.
        ============================================================ */}

                        <button
                          onClick={handleRestoreFromTrash}
                          className="btn-restore"
                          title="Khôi phục tệp đã chọn"
                        >
                          ↩ Khôi phục
                        </button>

                        <button
                          onClick={handlePermanentDelete}
                          className="btn-permanent-delete"
                          title="Xóa vĩnh viễn khỏi Cloud S3"
                        >
                          🗑 Xóa vĩnh viễn
                        </button>
                      </>
                    ) : (
                      /* ==============================================================
     NGOÀI THÙNG RÁC:
     Chỉ chuyển file vào Thùng rác, chưa xóa khỏi S3.
     ============================================================== */

                      <button
                        onClick={handleMoveToTrash}
                        className="btn-move-trash"
                        title="Chuyển tệp đã chọn vào Thùng rác"
                      >
                        🗑 Chuyển vào thùng rác
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                // THANH ĐIỀU HƯỚNG BÌNH THƯỜNG KHI KHÔNG CHỌN FILE
                <div className="breadcrumb-area" style={{ padding: "10px 0" }}>
                  <h1
                    className="page-title"
                    style={{
                      margin: 0,
                      fontSize: "1.25rem",
                      color: "#202124",
                      fontWeight: "400",
                    }}
                  >
                    {activeTab === "trash" ? (
                      "🗑️ Thùng rác"
                    ) : activeTab === "recent" ? (
                      "🕘 Gần đây"
                    ) : activeTab === "albums" ? (
                      "🖼️ Album"
                    ) : (
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span
                          className="root-crumb"
                          onClick={() => setCurrentFolder(null)}
                          style={{
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="#5f6368"
                          >
                            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
                          </svg>
                          Drive của tôi
                        </span>
                        {currentFolder && (
                          <span
                            className="sub-crumb"
                            style={{ color: "#5f6368" }}
                          >
                            <span style={{ margin: "0 8px" }}>&gt;</span>
                            {currentFolder.name}
                          </span>
                        )}
                      </div>
                    )}
                  </h1>
                </div>
              )}
            </div>

            {/* KHU VỰC VẼ DANH SÁCH FILE ẢNH ĐÁM MÂY */}
            <div
              className="list-section"
              ref={listRef}
              onMouseDown={handleMouseDown}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {" "}
              {/* [cite: 140, 141] */}
              {selectionBox && (
                <div
                  className="selection-lasso"
                  style={{
                    left: Math.min(selectionBox.startX, selectionBox.endX),
                    top: Math.min(selectionBox.startY, selectionBox.endY),
                    width: Math.abs(selectionBox.startX - selectionBox.endX),
                    height: Math.abs(selectionBox.startY - selectionBox.endY),
                  }}
                />
              )}
              {displayedItems.length === 0 ? (
                // KIỂM TRA: NẾU ĐANG Ở TAB THÙNG RÁC
                activeTab === "trash" ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "80px 40px",
                      color: "#5f6368",
                      marginTop: "50px",
                    }}
                  >
                    <div style={{ fontSize: "64px", marginBottom: "20px" }}>
                      🗑️
                    </div>
                    <h3
                      style={{
                        color: "#202124",
                        margin: "0 0 8px 0",
                        fontSize: "1.2rem",
                        fontWeight: "400",
                      }}
                    >
                      Thùng rác trống
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.95rem" }}>
                      Không có hình ảnh nào trong thùng rác cả.
                    </p>
                  </div>
                ) : (
                  // NẾU Ở CÁC TAB KHÁC (DRIVE CỦA TÔI) -> GIỮ NGUYÊN KHUNG KÉO THẢ UPLOAD
                  <div
                    className="empty-state drag-drop-zone"
                    onClick={() => fileInputRef.current.click()}
                    style={{
                      border: dragActive
                        ? "2px dashed #1a73e8"
                        : "2px dashed #dadce0",
                      backgroundColor: dragActive
                        ? "rgba(26, 115, 232, 0.05)"
                        : "#f8f9fa",
                      borderRadius: "16px",
                      padding: "60px 40px",
                      textAlign: "center",
                      cursor: "pointer",
                      marginTop: "50px",
                      marginLeft: "auto",
                      marginRight: "auto",
                      maxWidth: "600px",
                      transition: "all 0.2s ease-in-out",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "64px",
                        marginBottom: "20px",
                        opacity: dragActive ? 1 : 0.7,
                      }}
                    >
                      📥
                    </div>
                    <h3
                      style={{
                        margin: "0 0 10px 0",
                        color: "#202124",
                        fontSize: "1.2rem",
                      }}
                    >
                      Kho lưu trữ đang trống
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        color: "#5f6368",
                        fontSize: "0.95rem",
                        lineHeight: "1.5",
                      }}
                    >
                      <strong>Kéo thả</strong> hình ảnh trực tiếp vào khu vực
                      này
                      <br />
                      hoặc <strong>Nhấp chuột</strong> để mở thư mục và tiến
                      hành tải lên Cloud S3.
                    </p>
                  </div>
                )
              ) : (
                <div className="list-container">
                  <div className="list-header">
                    <div style={{ width: "40px" }}></div>
                    <div className="col-name">Tên</div>
                    <div className="col-date">Lần sửa đổi gần đây</div>
                    <div className="col-owner">Chủ sở hữu</div>{" "}
                    {/* [cite: 147, 148] */}
                    <div className="col-location">Kích cỡ</div>
                    <div className="col-action"></div>
                  </div>

                  {displayedItems.map((item) => (
                    <div
                      key={item.id}
                      data-id={item.id}
                      className={`list-row ${selectedIds.includes(item.id) ? "row-selected" : ""}`}
                      onClick={() => handleRowClick(item)}
                    >
                      {" "}
                      {/* [cite: 149, 150] */}
                      <div
                        style={{
                          width: "40px",
                          display: "flex",
                          alignItems: "center",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {" "}
                        {/* [cite: 151, 152] */}
                        <input
                          type="checkbox"
                          className="item-checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) => handleSelectItem(item.id, e)}
                        />{" "}
                        {/* [cite: 153, 154] */}
                      </div>
                      <div className="col-name">
                        {item.type === "folder" && (
                          <span className="file-icon-img">📁</span>
                        )}{" "}
                        {/* [cite: 154, 155] */}
                        {item.type === "album" && (
                          <span className="file-icon-img">🎨</span>
                        )}{" "}
                        {/* [cite: 155, 156] */}
                        {item.type === "image" && ( // [cite: 156]
                          <div className="row-thumbnail-box">
                            <img
                              src={item.localUrl}
                              alt="thumb"
                              className="row-thumb"
                            />{" "}
                            {/* [cite: 157, 158] */}
                          </div>
                        )}
                        <span className="file-name-text" title={item.name}>
                          {item.name}
                        </span>{" "}
                        {/* [cite: 158, 159] */}
                      </div>
                      <div className="col-date">{item.uploadDate}</div>
                      <div className="col-owner">
                        <span className="owner-avatar">T</span> {item.owner}
                      </div>{" "}
                      {/* [cite: 159, 160] */}
                      <div className="col-location">{item.size}</div>
                      <div
                        className="col-action"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {" "}
                        {/* [cite: 160, 161] */}
                        {item.type === "image" && ( // [cite: 161, 162]
                          <div className="more-action-container">
                            <button
                              className="btn-dots"
                              onClick={(e) => toggleMenu(item.id, e)}
                            >
                              ⋮
                            </button>{" "}
                            {/* [cite: 162, 163] */}
                            {menuOpenId === item.id && ( // [cite: 164]
                              <div className="dropdown-menu">
                                <div
                                  className="dropdown-item"
                                  onClick={(e) =>
                                    handleCopyLink(item.cloudUrl, e)
                                  }
                                >
                                  🔗 Sao chép đường dẫn
                                </div>{" "}
                                {/* [cite: 164, 167] */}
                                {/* ============================================================
                                  ĐÁNH DẤU / BỎ ĐÁNH DẤU YÊU THÍCH
                                  ============================================================ */}
                                <div
                                  className="dropdown-item"
                                  onClick={(e) => handleToggleFavorite(item, e)}
                                >
                                  {item.isStarred
                                    ? "⭐ Bỏ khỏi yêu thích"
                                    : "🤍 Thêm vào yêu thíc"}
                                </div>
                                <div
                                  className="dropdown-item"
                                  onClick={() => {
                                    alert("⚙️ Quyền truy cập thuộc về User!");
                                    setMenuOpenId(null);
                                  }}
                                >
                                  ⚙️ Quyền truy cập
                                </div>{" "}
                                {/* [cite: 168, 170] */}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* KHỐI OVERLAY PREVIEW ẢNH KHI NGƯỜI DÙNG NHẤP CHUỘT VÀO HÀNG */}
      {previewImage && ( // [cite: 172]
        <div className="preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="preview-header" onClick={(e) => e.stopPropagation()}>
            <span className="preview-title">🖼️ {previewImage.name}</span>
            <div className="preview-header-buttons">
              <button
                className="btn-preview-action"
                onClick={(e) => handleCopyLink(previewImage.cloudUrl, e)}
              >
                🔗 Sao chép link
              </button>{" "}
              {/* [cite: 173] */}
              <button
                className="btn-preview-close"
                onClick={() => setPreviewImage(null)}
              >
                ✕ Đóng
              </button>{" "}
              {/* [cite: 174, 175] */}
            </div>
          </div>
          <div className="preview-body" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage.localUrl}
              alt="Full preview"
              className="full-preview-img"
            />{" "}
            {/* [cite: 175, 176] */}
          </div>
        </div>
      )}
    </div>
  );
}

export default App; // [cite: 177]
