import React, { useState, useEffect } from 'react';
import { getEquipmentCalendar } from '../api/client';
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon, User, Info } from 'lucide-react';

const EquipmentCalendarModal = ({ equipment, onClose }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    if (equipment) {
      loadCalendarData();
    }
  }, [equipment]);

  const loadCalendarData = async () => {
    setLoading(true);
    try {
      const res = await getEquipmentCalendar(equipment.id);
      setRentals(res.data);
    } catch (error) {
      console.error("Failed to load calendar data", error);
    } finally {
      setLoading(false);
    }
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDay(null);
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDay(null);
  };

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => {
    let day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Make Monday 0, Sunday 6
  };

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  // Create array of days to render
  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null); // Empty slots before the 1st
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
  }

  // Calculate rentals for a specific day
  const getRentalsForDay = (date) => {
    if (!date) return [];
    
    // Normalize target date to start of day for comparison
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    return rentals.filter(rental => {
      const start = new Date(rental.start_date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(rental.end_date);
      end.setHours(23, 59, 59, 999);
      
      return target >= start && target <= end;
    });
  };

  const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarIcon size={24} className="text-primary" />
              Lịch Thuê: {equipment?.name}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Kho tổng: <span className="font-semibold text-gray-800">{equipment?.stock}</span> chiếc
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white hover:shadow-md text-gray-500 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Calendar View */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Calendar Controls */}
            <div className="flex justify-between items-center mb-6">
              <button onClick={prevMonth} className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-colors">
                <ChevronLeft size={20} />
              </button>
              <h3 className="text-xl font-bold text-gray-800">
                {monthNames[currentDate.getMonth()]} năm {currentDate.getFullYear()}
              </h3>
              <button onClick={nextMonth} className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => (
                  <div key={day} className="py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
              </div>
              
              {loading ? (
                <div className="p-12 text-center text-gray-400">Đang tải lịch trình...</div>
              ) : (
                <div className="grid grid-cols-7 divide-x divide-y divide-gray-100 border-t border-l border-gray-100">
                  {days.map((date, index) => {
                    if (!date) {
                      return <div key={`empty-${index}`} className="min-h-[100px] bg-gray-50/50 border-r border-b border-gray-100" />;
                    }

                    const dayRentals = getRentalsForDay(date);
                    const rentedCount = dayRentals.length;
                    const stock = equipment?.stock || 0;
                    
                    let statusColor = "bg-white hover:bg-gray-50";
                    let statusIndicator = null;

                    if (rentedCount > 0) {
                      if (rentedCount >= stock) {
                        statusColor = "bg-red-50 hover:bg-red-100";
                        statusIndicator = <div className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded border border-red-200">Hết hàng</div>;
                      } else {
                        statusColor = "bg-amber-50 hover:bg-amber-100";
                        statusIndicator = <div className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">Đã thuê {rentedCount}/{stock}</div>;
                      }
                    }

                    const isSelected = selectedDay && date.getTime() === selectedDay.getTime();

                    return (
                      <div 
                        key={index} 
                        onClick={() => setSelectedDay(date)}
                        className={`min-h-[100px] p-2 border-r border-b border-gray-100 cursor-pointer transition-colors relative
                          ${statusColor} 
                          ${isSelected ? 'ring-2 ring-inset ring-primary' : ''}
                        `}
                      >
                        <span className={`text-sm font-semibold ${rentedCount > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                          {date.getDate()}
                        </span>
                        
                        <div className="mt-2 space-y-1">
                          {statusIndicator}
                          {/* Visual bars for individual rentals (max 3) */}
                          {dayRentals.slice(0, 3).map((r, i) => (
                            <div key={i} className="h-1.5 w-full bg-blue-400 rounded-full opacity-80"></div>
                          ))}
                          {dayRentals.length > 3 && (
                            <div className="text-[9px] text-gray-500 font-medium text-center">+{dayRentals.length - 3} nữa</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="mt-4 flex gap-4 text-xs font-medium text-gray-500 justify-center">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-white border border-gray-200"></div> Trống</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-200"></div> Đang được thuê</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-200"></div> Hết hàng</div>
            </div>
          </div>

          {/* Sidebar Details (visible when a day is clicked) */}
          <div className="w-full md:w-80 bg-gray-50 border-t md:border-t-0 md:border-l border-gray-200 p-6 overflow-y-auto shrink-0">
            {selectedDay ? (
              <div>
                <h4 className="font-bold text-gray-900 text-lg border-b border-gray-200 pb-3 mb-4">
                  Chi tiết ngày {selectedDay.getDate()}/{selectedDay.getMonth() + 1}/{selectedDay.getFullYear()}
                </h4>
                
                {(() => {
                  const dayRentals = getRentalsForDay(selectedDay);
                  if (dayRentals.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-400">
                        <Info size={32} className="mx-auto mb-2 opacity-50" />
                        <p>Không có đơn thuê nào trong ngày này.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-sm text-gray-500 font-medium">Tổng cộng:</span>
                        <span className="bg-primary/10 text-primary font-bold px-2.5 py-1 rounded-lg text-sm">
                          {dayRentals.length} / {equipment.stock} chiếc
                        </span>
                      </div>

                      {dayRentals.map(rental => (
                        <div key={rental.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                              <User size={16} />
                            </div>
                            <span className="font-bold text-gray-800 text-sm">{rental.customer_name}</span>
                          </div>
                          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100">
                            Mã đơn: <span className="font-mono font-medium text-gray-700">#{rental.id}</span>
                            <br/>
                            Trạng thái: <span className="font-medium text-gray-700">{rental.status === 'active' ? 'Đang thuê' : 'Chờ xử lý'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400 flex flex-col items-center justify-center h-full">
                <CalendarIcon size={48} className="mb-4 text-gray-300" />
                <p className="font-medium text-gray-600">Chọn một ngày</p>
                <p className="text-sm mt-1">Bấm vào một ngày trên lịch để xem chi tiết các đơn thuê.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentCalendarModal;
